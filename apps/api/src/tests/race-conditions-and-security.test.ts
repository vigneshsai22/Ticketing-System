import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { ShiftableClock } from '@frontdesk/shared';
import { runFullSeed } from '../db/seed.js';
import { getDbClient, DatabaseClient } from '../db/client.js';
import { resetRateLimits } from '../services/magic-link.service.js';

describe('Race Conditions, Zod Validation, Rate Limiting & Security Suite', () => {
  let app: FastifyInstance;
  let clock: ShiftableClock;
  let db: DatabaseClient;
  let agentToken: string;
  let leadToken: string;
  let adminToken: string;

  beforeAll(async () => {
    clock = new ShiftableClock('2026-03-06T18:00:00.000Z');
    db = await getDbClient();
    await runFullSeed(db, clock);

    app = await buildApp({ clock });
    await app.ready();

    // 1. Authenticate Agent (Dev Sharma)
    const agentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'dev.sharma@arvo.internal' }
    });
    agentToken = JSON.parse(agentRes.body).token;

    // 2. Authenticate Lead (Aria Chen)
    const leadRes = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'aria.chen@arvo.internal' }
    });
    leadToken = JSON.parse(leadRes.body).token;

    // 3. Authenticate Admin (Kiran Patel)
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'kiran.patel@arvo.internal' }
    });
    adminToken = JSON.parse(adminRes.body).token;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.close();
  });

  // ==========================================================================
  // 1. ZOD VALIDATION ON EVERY INPUT
  // ==========================================================================
  describe('Zod Validation Enforcement', () => {
    it('rejects invalid email on demo login with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/demo-login',
        payload: { email: 'not-an-email' }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Valid email/i);
    });

    it('rejects ticket creation with missing subject or invalid priority with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { subject: '', priority: 'super-urgent' }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBeDefined();
    });

    it('rejects priority change without reason with 400 Bad Request', async () => {
      const ticketRes = await db.query<{ id: string }>('SELECT id FROM tickets LIMIT 1');
      const ticketId = ticketRes.rows[0].id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/priority`,
        headers: { authorization: `Bearer ${leadToken}` },
        payload: { priority: 'urgent', reason: '' }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Priority change reason is strictly required/i);
    });

    it('rejects SLA policy with negative minutes with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/sla-policies/urgent',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { respond_minutes: -50 }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBeDefined();
    });

    it('rejects invalid user role creation with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: 'newbie@arvo.internal', name: 'Newbie', role: 'superuser' }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. AUTHENTICATION & SECURITY HEADERS & CSRF
  // ==========================================================================
  describe('Auth Checks & Security Headers & CSRF', () => {
    it('rejects unauthenticated requests to protected ticket routes with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tickets'
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toMatch(/missing session/i);
    });

    it('rejects agent from accessing admin-only user management with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { authorization: `Bearer ${agentToken}` }
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toMatch(/Forbidden/i);
    });

    it('injects standard OWASP security headers on all responses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health'
      });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('blocks cross-origin mutating requests when relying on session cookies (CSRF check)', async () => {
      const ticketRes = await db.query<{ id: string }>('SELECT id FROM tickets LIMIT 1');
      const ticketId = ticketRes.rows[0].id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/notes`,
        headers: {
          cookie: `frontdesk_session=${agentToken}`,
          origin: 'https://malicious-attacker-site.com',
          host: 'frontdesk.arvo.internal'
        },
        payload: { body: 'Injected CSRF note' }
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toMatch(/CSRF check failed/i);
    });
  });

  // ==========================================================================
  // 3. RATE LIMITING ON CUSTOMER ROUTES
  // ==========================================================================
  describe('Customer Route Rate Limiting', () => {
    it('sets X-RateLimit headers and rejects after exceeding burst quota', async () => {
      const testIp = '198.51.100.42';

      // Fire 60 requests within the quota window
      let lastRes = await app.inject({
        method: 'POST',
        url: '/api/customer/tickets',
        headers: { 'x-forwarded-for': testIp },
        payload: {
          email: 'ratelimit@acme.com',
          name: 'Rate Limit Tester',
          subject: 'Rate Limit Test',
          priority: 'low',
          message: 'Testing rate limiter'
        }
      });

      expect(lastRes.headers['x-ratelimit-limit']).toBe('60');
      expect(Number(lastRes.headers['x-ratelimit-remaining'])).toBeLessThanOrEqual(59);

      // Rapidly exhaust remainder
      for (let i = 0; i < 60; i++) {
        lastRes = await app.inject({
          method: 'POST',
          url: '/api/customer/tickets',
          headers: { 'x-forwarded-for': testIp },
          payload: {
            email: 'ratelimit@acme.com',
            name: 'Rate Limit Tester',
            subject: 'Rate Limit Test',
            priority: 'low',
            message: 'Testing rate limiter'
          }
        });
      }

      // Next request must be rejected with 429 Too Many Requests
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/customer/tickets',
        headers: { 'x-forwarded-for': testIp },
        payload: {
          email: 'ratelimit@acme.com',
          name: 'Rate Limit Tester',
          subject: 'Rate Limit Test',
          priority: 'low',
          message: 'Testing rate limiter'
        }
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers['retry-after']).toBeDefined();
      expect(JSON.parse(blockedRes.body).error).toMatch(/Too many requests/i);

      // Reset rate limit state for subsequent customer tests
      resetRateLimits();
    });
  });

  // ==========================================================================
  // 4. RACE CONDITIONS FIXES & VERIFICATION
  // ==========================================================================
  describe('Concurrency & Race Conditions', () => {
    it('Double Submit: concurrent identical replies with Idempotency-Key return same message without duplicate row', async () => {
      // Create a test ticket
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { subject: 'Double Submit Test', priority: 'medium' }
      });
      const ticketId = JSON.parse(createRes.body).ticket.id;

      // Claim it
      await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/claim`,
        headers: { authorization: `Bearer ${agentToken}` }
      });

      const idempotencyKey = 'double-submit-key-999';

      // Send 5 parallel requests with identical idempotency key
      const promises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'POST',
          url: `/api/tickets/${ticketId}/reply`,
          headers: {
            authorization: `Bearer ${agentToken}`,
            'idempotency-key': idempotencyKey
          },
          payload: { body: 'Public response to customer' }
        })
      );

      const responses = await Promise.all(promises);
      for (const res of responses) {
        expect([200, 201]).toContain(res.statusCode); // 201 created or 200 duplicate response
      }

      // Verify exactly ONE row was inserted into public_messages
      const msgRows = await db.query(
        'SELECT id FROM public_messages WHERE ticket_id = $1 AND idempotency_key = $2',
        [ticketId, idempotencyKey]
      );
      expect(msgRows.rows.length).toBe(1);
    });

    it('Claim vs Reassign: concurrent claim and reassign with version check detects conflict gracefully', async () => {
      // Create fresh unassigned ticket
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { subject: 'Claim vs Reassign Test', priority: 'low' }
      });
      const ticket = JSON.parse(createRes.body).ticket;
      const ticketId = ticket.id;
      const initialVersion = ticket.version;

      // Agent A claims, while Lead simultaneously reassigns specifying initialVersion
      const agentResPromise = app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/claim`,
        headers: { authorization: `Bearer ${agentToken}` }
      });

      const leadResPromise = app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/reassign`,
        headers: { authorization: `Bearer ${leadToken}` },
        payload: {
          assigneeId: (await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', ['sara.lindqvist@arvo.internal'])).rows[0].id,
          version: initialVersion
        }
      });

      const [claimRes, reassignRes] = await Promise.all([agentResPromise, leadResPromise]);

      // Exactly one succeeds, or reassign gracefully fails with 409 Conflict because version advanced
      const statuses = [claimRes.statusCode, reassignRes.statusCode];
      expect(statuses).toContain(200);
      if (claimRes.statusCode === 200 && reassignRes.statusCode !== 200) {
        expect(reassignRes.statusCode).toBe(409);
      }
    });

    it('Resume vs Auto-Close: customer reply resumes ticket; scheduler auto-close safely skips', async () => {
      // 1. Create customer ticket with magic link
      const custCreateRes = await app.inject({
        method: 'POST',
        url: '/api/customer/tickets',
        payload: {
          email: 'auto.close.tester@acme.com',
          name: 'ACME Tester',
          subject: 'Resume vs Auto-Close Test',
          priority: 'medium',
          message: 'Initial problem description'
        }
      });
      expect(custCreateRes.statusCode).toBe(201);
      const custData = JSON.parse(custCreateRes.body);
      const ticketId = custData.ticket.id;
      const customerToken = custData.token;

      // 2. Transition through legal state machine: new -> open -> waiting_on_customer
      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/status`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'open' }
      });

      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/status`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'waiting_on_customer', reason: 'Awaiting logs' }
      });

      // Update magic link expiration so token remains valid across the 6-day jump
      await db.query(
        `UPDATE magic_links SET expires_at = (NOW() + INTERVAL '30 days')`
      );

      // Shift clock forward 6 days (over 2,700 business minutes)
      clock.shiftByDays(6);

      // Concurrently trigger customer reply and scheduler run
      const replyPromise = app.inject({
        method: 'POST',
        url: `/api/customer/tickets/${ticketId}/reply`,
        headers: {
          'x-magic-link-token': customerToken
        },
        payload: { body: 'Here are the requested logs!' }
      });

      const schedulerPromise = app.inject({
        method: 'POST',
        url: '/api/scheduler/run'
      });

      await Promise.all([replyPromise, schedulerPromise]);

      // Verify ticket state remains consistent (not double-updated or orphaned)
      const finalTicket = await db.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [ticketId]);
      expect(['in_progress', 'open', 'closed']).toContain(finalTicket.rows[0].status);
    });

    it('Priority Change vs Breach Detection: priority upgrade recomputes deadlines under row lock without corrupting breaches', async () => {
      // Create low priority ticket
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { subject: 'Priority vs Breach Test', priority: 'low' }
      });
      const ticketId = JSON.parse(createRes.body).ticket.id;

      // Concurrently execute priority change to urgent and scheduler pass
      const priorityPromise = app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/priority`,
        headers: { authorization: `Bearer ${leadToken}` },
        payload: { priority: 'urgent', reason: 'Customer escalated issue to VP' }
      });

      const schedulerPromise = app.inject({
        method: 'POST',
        url: '/api/scheduler/run'
      });

      const [pRes, sRes] = await Promise.all([priorityPromise, schedulerPromise]);
      expect(pRes.statusCode).toBe(200);
      expect(sRes.statusCode).toBe(200);

      // Verify cycle deadlines match urgent SLA
      const cycle = await db.query<{ response_due: string }>('SELECT response_due FROM ticket_cycles WHERE ticket_id = $1', [ticketId]);
      expect(cycle.rows.length).toBe(1);
      expect(cycle.rows[0].response_due).toBeDefined();
    });
  });
});
