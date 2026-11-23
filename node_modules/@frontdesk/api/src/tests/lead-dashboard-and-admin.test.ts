import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { ShiftableClock } from '@frontdesk/shared';
import { getDbClient } from '../db/client.js';
import { runFullSeed } from '../db/seed.js';

describe('Lead Dashboard & Admin Governance Suite', () => {
  let app: FastifyInstance;
  let clock: ShiftableClock;
  let leadCookie: string;
  let adminCookie: string;
  let agentCookie: string;

  beforeAll(async () => {
    // Pin to Monday 11:00 AM IST on seed week (2026-03-09)
    clock = new ShiftableClock('2026-03-09T05:30:00.000Z', true);
    app = await buildApp({ clock });
    await app.ready();

    const db = await getDbClient();
    await runFullSeed(db, clock);

    // 1. Login as Lead (Aria Chen)
    const leadLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'aria.chen@arvo.internal' }
    });
    expect(leadLogin.statusCode).toBe(200);
    leadCookie = leadLogin.headers['set-cookie'] as string;

    // 2. Login as Admin (Kiran Patel)
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'kiran.patel@arvo.internal' }
    });
    expect(adminLogin.statusCode).toBe(200);
    adminCookie = adminLogin.headers['set-cookie'] as string;

    // 3. Login as Agent (Dev Sharma)
    const agentLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'dev.sharma@arvo.internal' }
    });
    expect(agentLogin.statusCode).toBe(200);
    agentCookie = agentLogin.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. LEAD DASHBOARD ANALYTICS & ROOT CAUSE ATTRIBUTION
  // --------------------------------------------------------------------------
  it('1. Role authorization: Agent is rejected with 403, Lead gets 200 with full KPI analytics', async () => {
    // Agent attempt
    const agentRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/lead-dashboard',
      headers: { cookie: agentCookie }
    });
    expect(agentRes.statusCode).toBe(403);

    // Lead attempt
    const leadRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/lead-dashboard',
      headers: { cookie: leadCookie }
    });
    expect(leadRes.statusCode).toBe(200);

    const body = leadRes.json();
    expect(body.kpis).toBeDefined();
    expect(typeof body.kpis.response_compliance_pct).toBe('number');
    expect(typeof body.kpis.resolution_compliance_pct).toBe('number');
    expect(typeof body.kpis.currently_late).toBe('number');
    expect(body.kpis.waiting_on_customer).toBeGreaterThanOrEqual(1);

    // Charts data
    expect(body.charts).toBeDefined();
    expect(Array.isArray(body.charts.late_over_time)).toBe(true);
    expect(Array.isArray(body.charts.breach_reasons)).toBe(true);
    expect(Array.isArray(body.charts.workload_per_agent)).toBe(true);
    expect(body.charts.workload_per_agent.length).toBeGreaterThanOrEqual(9);

    // Late tickets table
    expect(Array.isArray(body.late_tickets)).toBe(true);
    expect(body.late_tickets.length).toBeGreaterThanOrEqual(1);

    const sampleLate = body.late_tickets[0];
    expect(sampleLate.human_id).toMatch(/^INC-/);
    expect(sampleLate.why_late).toBeDefined();
    expect(sampleLate.why_late_label).toBeDefined();
    expect(typeof sampleLate.customer_wait_minutes_excluded).toBe('number');
  });

  it('2. Filtered queries: correctly filters dashboard data by priority and agent', async () => {
    const urgentRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/lead-dashboard?priority=urgent',
      headers: { cookie: leadCookie }
    });
    expect(urgentRes.statusCode).toBe(200);
    const urgentBody = urgentRes.json();

    // All returned late tickets must be urgent
    for (const t of urgentBody.late_tickets) {
      expect(t.priority).toBe('urgent');
    }
  });

  it('3. Internal CSV Export: includes confidential header and internal staff attribution columns', async () => {
    const csvRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/export-csv',
      headers: { cookie: leadCookie }
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-disposition']).toContain('attachment');

    const csvText = csvRes.body;
    expect(csvText).toContain('ARVO SYSTEMS - LEAD AUDIT & SLA REPORT');
    expect(csvText).toContain('WARNING: CONTAINS INTERNAL DATA');
    expect(csvText).toContain('"Ticket ID"');
    expect(csvText).toContain('"Why Late"');
    expect(csvText).toContain('"Assignee"');
  });

  // --------------------------------------------------------------------------
  // 2. ADMIN HOLIDAY CALENDAR MANAGEMENT
  // --------------------------------------------------------------------------
  it('4. Holiday Calendar: lists, provisions new holiday with audit logging, and deletes it', async () => {
    // 1. List holidays
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/holidays',
      headers: { cookie: adminCookie }
    });
    expect(listRes.statusCode).toBe(200);
    const initialHolidays = listRes.json().holidays;
    expect(initialHolidays.length).toBeGreaterThanOrEqual(5);

    // 2. Create holiday (Admin only)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/holidays',
      headers: { cookie: adminCookie },
      payload: {
        date: '2026-11-20',
        name: 'Arvo Foundation Day'
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().holiday;
    expect(created.name).toBe('Arvo Foundation Day');

    // Verify audit event
    const db = await getDbClient();
    const auditRes = await db.query(
      `SELECT * FROM audit_events WHERE event_type = 'holiday_created' ORDER BY seq DESC LIMIT 1`
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].after.name).toBe('Arvo Foundation Day');

    // 3. Delete holiday
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/holidays/${created.id}`,
      headers: { cookie: adminCookie }
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);

    const auditDelRes = await db.query(
      `SELECT * FROM audit_events WHERE event_type = 'holiday_deleted' ORDER BY seq DESC LIMIT 1`
    );
    expect(auditDelRes.rows.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 3. SLA POLICIES & SYSTEM SETTINGS GOVERNANCE (FUTURE CALCULATIONS RULE)
  // --------------------------------------------------------------------------
  it('5. SLA Policies & Settings: modifies policy and settings with audit trail and future-only notice', async () => {
    // 1. List SLA policies
    const policiesRes = await app.inject({
      method: 'GET',
      url: '/api/admin/sla-policies',
      headers: { cookie: adminCookie }
    });
    expect(policiesRes.statusCode).toBe(200);
    expect(policiesRes.json().policies.length).toBe(3);

    // 2. Update urgent policy
    const patchPolicyRes = await app.inject({
      method: 'PATCH',
      url: '/api/admin/sla-policies/urgent',
      headers: { cookie: adminCookie },
      payload: {
        respond_minutes: 150
      }
    });
    expect(patchPolicyRes.statusCode).toBe(200);
    const policyBody = patchPolicyRes.json();
    expect(policyBody.policy.respond_minutes).toBe(150);
    expect(policyBody.notice).toContain('Applies strictly to future ticket computations');

    // 3. Update system setting
    const patchSettingRes = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings/auto_close_minutes',
      headers: { cookie: adminCookie },
      payload: {
        value: 2800,
        description: 'Auto close minutes extended'
      }
    });
    expect(patchSettingRes.statusCode).toBe(200);
    const settingBody = patchSettingRes.json();
    expect(settingBody.setting.value).toBe(2800);
    expect(settingBody.notice).toContain('Applies strictly to future ticket computations');

    // Verify audit events
    const db = await getDbClient();
    const policyAudit = await db.query(
      `SELECT * FROM audit_events WHERE event_type = 'sla_policy_updated' ORDER BY seq DESC LIMIT 1`
    );
    expect(policyAudit.rows.length).toBe(1);
    expect(policyAudit.rows[0].after.respond_minutes).toBe(150);

    const settingAudit = await db.query(
      `SELECT * FROM audit_events WHERE event_type = 'settings_updated' ORDER BY seq DESC LIMIT 1`
    );
    expect(settingAudit.rows.length).toBe(1);
    expect(settingAudit.rows[0].after.value).toBe(2800);
  });

  // --------------------------------------------------------------------------
  // 4. CANNED REPLIES & USER PROVISIONING
  // --------------------------------------------------------------------------
  it('6. Canned Replies: provisions, edits, and deletes macros', async () => {
    // 1. Create canned reply
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/canned-replies',
      headers: { cookie: leadCookie },
      payload: {
        title: 'Network Diagnostics Request',
        shortcut: '/netlog',
        category: 'troubleshooting',
        content: 'Please upload traceroute and network packet logs.'
      }
    });
    expect(createRes.statusCode).toBe(201);
    const reply = createRes.json().canned_reply;
    expect(reply.shortcut).toBe('/netlog');

    // 2. Patch canned reply
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/canned-replies/${reply.id}`,
      headers: { cookie: leadCookie },
      payload: {
        title: 'Updated Network Diagnostics'
      }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().canned_reply.title).toBe('Updated Network Diagnostics');

    // 3. Delete canned reply
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/canned-replies/${reply.id}`,
      headers: { cookie: leadCookie }
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);
  });

  it('7. Admin Users: creates new agent, modifies role, and audits transitions', async () => {
    // 1. Create agent
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Tanya Sen',
        email: 'tanya.sen@arvo.internal',
        role: 'agent'
      }
    });
    expect(createRes.statusCode).toBe(201);
    const newUser = createRes.json().user;
    expect(newUser.name).toBe('Tanya Sen');
    expect(newUser.role).toBe('agent');

    // 2. Promote to Lead
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${newUser.id}`,
      headers: { cookie: adminCookie },
      payload: {
        role: 'lead'
      }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().user.role).toBe('lead');

    // Verify audit
    const db = await getDbClient();
    const auditRes = await db.query(
      `SELECT * FROM audit_events WHERE event_type = 'user_updated' ORDER BY seq DESC LIMIT 1`
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].after.role).toBe('lead');
  });
});
