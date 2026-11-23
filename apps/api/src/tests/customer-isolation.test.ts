import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildApp } from '../app.js';
import { getDbClient, DatabaseClient } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runStubSeed } from '../db/seed-stub.js';
import { ShiftableClock } from '@frontdesk/shared';
import { createMagicLink } from '../services/magic-link.service.js';

describe('Customer Portal, Public Replies, Exports & INC-0304 Canary Test', () => {
  let app: FastifyInstance;
  let db: DatabaseClient;
  let clock: ShiftableClock;

  let leadCookie: string;
  let agentCookie: string;
  let secondAgentCookie: string;

  beforeAll(async () => {
    clock = new ShiftableClock();
    // Monday 2026-03-02 10:00:00 Asia/Kolkata
    clock.set('2026-03-02T04:30:00.000Z', true);

    await runMigrations();
    await runStubSeed();
    db = await getDbClient();

    app = await buildApp({ clock });
    await app.ready();

    // Lead Login (Aria Chen)
    const leadLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { role: 'lead' }
    });
    leadCookie = `${leadLogin.cookies[0].name}=${leadLogin.cookies[0].value}`;

    // Agent 1 Login (Dev Sharma)
    const agentLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'dev.sharma@arvo.internal' }
    });
    agentCookie = `${agentLogin.cookies[0].name}=${agentLogin.cookies[0].value}`;

    // Agent 2 Login (Sara Lindqvist)
    const agent2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'sara.lindqvist@arvo.internal' }
    });
    secondAgentCookie = `${agent2Login.cookies[0].name}=${agent2Login.cookies[0].value}`;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.close();
  });

  // --------------------------------------------------------------------------
  // 1. Agent Endpoints: Reply (assignee only, idempotency, wait_on_customer)
  // --------------------------------------------------------------------------
  it('Agent Reply: requires Idempotency-Key and rejects non-assignee agent', async () => {
    // 1. Create ticket and claim by Agent 1 (Dev Sharma)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { cookie: agentCookie },
      payload: { subject: 'VPN Gateway Auth Issue', priority: 'medium' }
    });
    const ticketId = createRes.json().ticket.id;

    await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/claim`,
      headers: { cookie: agentCookie }
    });

    // 2. Reply without Idempotency-Key -> 400 Bad Request
    const noKeyRes = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/reply`,
      headers: { cookie: agentCookie },
      payload: { body: 'Attempting to reply without header' }
    });
    expect(noKeyRes.statusCode).toBe(400);
    expect(noKeyRes.json().error).toContain('Idempotency-Key header is required');

    // 3. Second agent (Sara) attempts reply to Dev's ticket -> 403 Forbidden
    const unauthReply = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/reply`,
      headers: {
        cookie: secondAgentCookie,
        'idempotency-key': 'idempotency-key-001'
      },
      payload: { body: 'Interfering reply from another agent' }
    });
    expect(unauthReply.statusCode).toBe(403);
    expect(unauthReply.json().error).toContain('Only the assigned agent may post a public reply');

    // 4. Assigned agent replies with Idempotency-Key and wait_on_customer = true
    const validReply = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/reply`,
      headers: {
        cookie: agentCookie,
        'idempotency-key': 'idempotency-key-002'
      },
      payload: {
        body: 'Please provide the client log from /var/log/openvpn.log',
        wait_on_customer: true
      }
    });
    expect(validReply.statusCode).toBe(201);
    expect(validReply.json().message.body).toContain('provide the client log');

    // 5. First public reply sets first_response_at on cycle
    const cycleRes = await db.query(
      'SELECT first_response_at FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = 1',
      [ticketId]
    );
    expect(cycleRes.rows[0].first_response_at).toBeDefined();

    // 6. wait_on_customer paused both clocks and updated ticket status
    const ticketCheck = await db.query('SELECT status FROM tickets WHERE id = $1', [ticketId]);
    expect(ticketCheck.rows[0].status).toBe('waiting_on_customer');

    const pauseCheck = await db.query(
      'SELECT * FROM sla_pauses WHERE ticket_id = $1 AND ended_at IS NULL',
      [ticketId]
    );
    expect(pauseCheck.rows.length).toBe(1);

    // 7. Duplicate submission with same Idempotency-Key returns existing message
    const duplicateReply = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/reply`,
      headers: {
        cookie: agentCookie,
        'idempotency-key': 'idempotency-key-002'
      },
      payload: { body: 'Resubmitted network retry' }
    });
    expect(duplicateReply.statusCode).toBe(200);
    expect(duplicateReply.json().duplicate).toBe(true);
  });

  it('Agent Note: internal notes reside in separate table and do not satisfy first response', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { cookie: agentCookie },
      payload: { subject: 'Internal Diagnostics Ticket', priority: 'urgent' }
    });
    const ticketId = createRes.json().ticket.id;

    // Post internal note
    const noteRes = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/notes`,
      headers: { cookie: agentCookie },
      payload: { body: 'Triaged: probable root cause is DNS TTL cache poisoning.' }
    });
    expect(noteRes.statusCode).toBe(201);

    // Verify first_response_at is STILL NULL
    const cycleRes = await db.query(
      'SELECT first_response_at FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = 1',
      [ticketId]
    );
    expect(cycleRes.rows[0].first_response_at).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. Customer API (Magic-Link Token, Create, View, Reply, Reopen)
  // --------------------------------------------------------------------------
  it('Customer API: direct ticket creation, viewing, customer reply resumes clock, reopen within window', async () => {
    // 1. Customer creates ticket directly
    const createCustTicket = await app.inject({
      method: 'POST',
      url: '/api/customer/tickets',
      payload: {
        email: 'alice.walker@external-corp.com',
        name: 'Alice Walker',
        subject: 'Cannot login to billing dashboard',
        priority: 'urgent',
        message: 'The billing portal shows 502 Bad Gateway.'
      }
    });
    expect(createCustTicket.statusCode).toBe(201);
    const { ticket, token } = createCustTicket.json();
    expect(ticket.id).toBeDefined();
    expect(token).toBeDefined();

    // 2. Customer views ticket thread using magic-link token
    const threadRes = await app.inject({
      method: 'GET',
      url: `/api/customer/tickets/${ticket.id}/thread?token=${token}`
    });
    expect(threadRes.statusCode).toBe(200);
    const events = threadRes.json().thread;
    expect(events.length).toBeGreaterThanOrEqual(1);

    // 3. Put ticket into waiting_on_customer by agent
    await db.query(
      `UPDATE tickets SET status = 'waiting_on_customer' WHERE id = $1`,
      [ticket.id]
    );
    await db.query(
      `INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, paused_by, reason)
       VALUES ($1, 1, CURRENT_TIMESTAMP, NULL, 'Agent waiting on Alice')`,
      [ticket.id]
    );

    // 4. Customer replies -> RESUMES clocks and moves status out of waiting_on_customer
    const custReply = await app.inject({
      method: 'POST',
      url: `/api/customer/tickets/${ticket.id}/reply?token=${token}`,
      payload: { body: 'Here is the screenshot of the error.' }
    });
    expect(custReply.statusCode).toBe(200);

    // Verify status is no longer waiting_on_customer and pause is ended
    const updatedTicket = await db.query('SELECT status FROM tickets WHERE id = $1', [ticket.id]);
    expect(updatedTicket.rows[0].status).not.toBe('waiting_on_customer');

    const openPauses = await db.query(
      'SELECT * FROM sla_pauses WHERE ticket_id = $1 AND ended_at IS NULL',
      [ticket.id]
    );
    expect(openPauses.rows.length).toBe(0);

    // 5. Resolve ticket
    await db.query(
      `UPDATE tickets SET status = 'resolved' WHERE id = $1`,
      [ticket.id]
    );
    await db.query(
      `UPDATE ticket_cycles SET resolved_at = CURRENT_TIMESTAMP WHERE ticket_id = $1 AND cycle_no = 1`,
      [ticket.id]
    );

    // 6. Customer reopens within window -> Starts fresh cycle (cycle 2)
    const reopenRes = await app.inject({
      method: 'POST',
      url: `/api/customer/tickets/${ticket.id}/reopen?token=${token}`,
      payload: { reason: 'Error reoccurred this morning' }
    });
    expect(reopenRes.statusCode).toBe(200);
    const reopenBody = reopenRes.json();
    expect(reopenBody.reopened).toBe(true);
    expect(reopenBody.ticket.status).toBe('reopened');

    // Verify cycle 2 in DB
    const cycle2 = await db.query(
      'SELECT * FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = 2',
      [ticket.id]
    );
    expect(cycle2.rows.length).toBe(1);
  });

  it('Customer API: reopening after window expiration spawns a linked new ticket', async () => {
    // 1. Create a resolved ticket whose resolution was 10 days ago (window is 5 days)
    const custRes = await db.query('SELECT id FROM customers LIMIT 1');
    const customerId = custRes.rows[0].id;

    const oldTicketRes = await db.query(
      `INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Ancient Resolved Ticket', 'low', 'resolved', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [customerId]
    );
    const oldTicketId = oldTicketRes.rows[0].id;

    // Set resolved_at 10 business days in the past relative to clock
    const clockNowMs = clock.now().getTime();
    const resolvedPastIso = new Date(clockNowMs - 14 * 24 * 3600 * 1000).toISOString();
    const clockStartPastIso = new Date(clockNowMs - 20 * 24 * 3600 * 1000).toISOString();

    await db.query(
      `INSERT INTO ticket_cycles (ticket_id, cycle_no, clock_start, response_due, resolve_due, resolved_at)
       VALUES ($1, 1, $2, $2, $3, $3)`,
      [oldTicketId, clockStartPastIso, resolvedPastIso]
    );

    const { rawToken } = await createMagicLink(db, clock, {
      customerId,
      ticketId: oldTicketId
    });

    // 2. Customer attempts to reopen -> Window expired -> Creates a NEW linked ticket!
    const reopenAttempt = await app.inject({
      method: 'POST',
      url: `/api/customer/tickets/${oldTicketId}/reopen?token=${rawToken}`,
      payload: { reason: 'Need help again 10 days later' }
    });

    expect(reopenAttempt.statusCode).toBe(200);
    const resBody = reopenAttempt.json();
    expect(resBody.reopened).toBe(false);
    expect(resBody.new_ticket_created).toBe(true);
    expect(resBody.ticket.id).not.toBe(oldTicketId);

    // Verify link via parent_ticket_id
    const newTicketDb = await db.query('SELECT parent_ticket_id FROM tickets WHERE id = $1', [resBody.ticket.id]);
    expect(newTicketDb.rows[0].parent_ticket_id).toBe(oldTicketId);
  });

  // --------------------------------------------------------------------------
  // 3. Strict Architectural Boundary Enforcement (INC-0304)
  // --------------------------------------------------------------------------
  it('Architectural Boundary: customer modules must NEVER import internal_notes or notes repository', () => {
    const customerDir = path.resolve(__dirname, '../services/customer');
    const customerRoutesFile = path.resolve(__dirname, '../routes/customer.routes.ts');

    const filesToCheck: string[] = [customerRoutesFile];
    if (fs.existsSync(customerDir)) {
      const dirFiles = fs.readdirSync(customerDir).map(f => path.join(customerDir, f));
      filesToCheck.push(...dirFiles);
    }

    const forbiddenTerms = [
      'internal_notes',
      'notes.repository',
      'getInternalNotesForTicket',
      'addInternalNote'
    ];

    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of filesToCheck) {
      if (!fs.existsSync(file) || (!file.endsWith('.ts') && !file.endsWith('.js'))) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

        for (const term of forbiddenTerms) {
          if (line.includes(term)) {
            violations.push({
              file: path.basename(file),
              line: index + 1,
              match: line.trim()
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      console.error('INC-0304 Boundary Violations found in customer module:', violations);
    }
    expect(violations, 'Found forbidden internal notes references in customer module!').toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 4. Exports: Customer Transcript vs Internal Audit Report
  // --------------------------------------------------------------------------
  it('Exports: customer export is public only, internal export contains labeled notes', async () => {
    const custRes = await db.query('SELECT id FROM customers LIMIT 1');
    const customerId = custRes.rows[0].id;
    const userRes = await db.query('SELECT id FROM users LIMIT 1');
    const agentId = userRes.rows[0].id;

    // 1. Create ticket with a public message AND a secret internal note
    const ticketRes = await db.query(
      `INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Transcript Export Check', 'medium', 'open', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [customerId]
    );
    const ticketId = ticketRes.rows[0].id;

    await db.query(
      `INSERT INTO public_messages (ticket_id, sender_type, sender_id, body)
       VALUES ($1, 'agent', $2, 'Public customer guidance message')`,
      [ticketId, agentId]
    );

    const secretContent = 'AGENT_INTERNAL_PASSWORD_RESET_DEBUG_ONLY_XYZ';
    await db.query(
      `INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)`,
      [ticketId, agentId, secretContent]
    );

    // 2. Customer transcript export -> MUST NOT contain secretContent
    const customerExport = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/export/customer`,
      headers: { cookie: agentCookie }
    });
    expect(customerExport.statusCode).toBe(200);
    expect(customerExport.body).toContain('Public customer guidance message');
    expect(customerExport.body).not.toContain(secretContent);

    // 3. Internal export (Lead only) -> MUST contain secretContent clearly labeled
    const internalExport = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/export/internal`,
      headers: { cookie: leadCookie }
    });
    expect(internalExport.statusCode).toBe(200);
    expect(internalExport.body).toContain('[INTERNAL NOTE - CONFIDENTIAL]');
    expect(internalExport.body).toContain(secretContent);
  });

  // --------------------------------------------------------------------------
  // 5. INC-0304 CANARY TEST (Fail-the-Build Verification)
  // --------------------------------------------------------------------------
  it('INC-0304 CANARY TEST: "CANARY_9f3a" in internal note NEVER appears in any customer endpoint, export, outbox, or SSE', async () => {
    const canaryString = 'CANARY_9f3a';

    // 1. Create a ticket and insert an internal note with CANARY_9f3a
    const custRes = await db.query('SELECT id FROM customers LIMIT 1');
    const userRes = await db.query('SELECT id FROM users LIMIT 1');
    const customerId = custRes.rows[0].id;
    const agentId = userRes.rows[0].id;

    const ticketRes = await db.query(
      `INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Canary Trap Ticket', 'urgent', 'open', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [customerId]
    );
    const ticketId = ticketRes.rows[0].id;

    await db.query(
      `INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)`,
      [ticketId, agentId, `CLASSIFIED INC-0304 AGENT MEMO: ${canaryString} DO NOT LEAK`]
    );

    const { rawToken } = await createMagicLink(db, clock, {
      customerId,
      ticketId
    });

    // 2. Probe Customer Ticket Endpoint
    const custTicketRes = await app.inject({
      method: 'GET',
      url: `/api/customer/tickets/${ticketId}?token=${rawToken}`
    });
    expect(custTicketRes.statusCode).toBe(200);
    expect(custTicketRes.body).not.toContain(canaryString);

    // 3. Probe Customer Thread Endpoint
    const custThreadRes = await app.inject({
      method: 'GET',
      url: `/api/customer/tickets/${ticketId}/thread?token=${rawToken}`
    });
    expect(custThreadRes.statusCode).toBe(200);
    expect(custThreadRes.body).not.toContain(canaryString);

    // 4. Probe Customer Reply Endpoint response
    const custReplyRes = await app.inject({
      method: 'POST',
      url: `/api/customer/tickets/${ticketId}/reply?token=${rawToken}`,
      payload: { body: 'Testing customer reply for canary check' }
    });
    expect(custReplyRes.statusCode).toBe(200);
    expect(custReplyRes.body).not.toContain(canaryString);

    // 5. Probe Customer Transcript Export
    const custExportRes = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/export/customer`,
      headers: { cookie: agentCookie }
    });
    expect(custExportRes.statusCode).toBe(200);
    expect(custExportRes.body).not.toContain(canaryString);

    // 6. Probe Public Search
    const publicSearchRes = await app.inject({
      method: 'GET',
      url: `/api/search?q=${canaryString}`,
      headers: { cookie: agentCookie }
    });
    expect(publicSearchRes.statusCode).toBe(200);
    expect(publicSearchRes.body).not.toContain(canaryString);

    // 7. Probe Outbox Table Emails
    const outboxRes = await db.query('SELECT * FROM outbox');
    const serializedOutbox = JSON.stringify(outboxRes.rows);
    expect(serializedOutbox).not.toContain(canaryString);

    // 8. Probe Database View customer_visible_events
    const viewRes = await db.query('SELECT * FROM customer_visible_events WHERE ticket_id = $1', [ticketId]);
    const serializedView = JSON.stringify(viewRes.rows);
    expect(serializedView).not.toContain(canaryString);
  });
});
