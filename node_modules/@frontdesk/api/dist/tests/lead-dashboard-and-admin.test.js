"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_js_1 = require("../app.js");
const shared_1 = require("@frontdesk/shared");
const client_js_1 = require("../db/client.js");
const seed_js_1 = require("../db/seed.js");
(0, vitest_1.describe)('Lead Dashboard & Admin Governance Suite', () => {
    let app;
    let clock;
    let leadCookie;
    let adminCookie;
    let agentCookie;
    (0, vitest_1.beforeAll)(async () => {
        // Pin to Monday 11:00 AM IST on seed week (2026-03-09)
        clock = new shared_1.ShiftableClock('2026-03-09T05:30:00.000Z', true);
        app = await (0, app_js_1.buildApp)({ clock });
        await app.ready();
        const db = await (0, client_js_1.getDbClient)();
        await (0, seed_js_1.runFullSeed)(db, clock);
        // 1. Login as Lead (Aria Chen)
        const leadLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { email: 'aria.chen@arvo.internal' }
        });
        (0, vitest_1.expect)(leadLogin.statusCode).toBe(200);
        leadCookie = leadLogin.headers['set-cookie'];
        // 2. Login as Admin (Kiran Patel)
        const adminLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { email: 'kiran.patel@arvo.internal' }
        });
        (0, vitest_1.expect)(adminLogin.statusCode).toBe(200);
        adminCookie = adminLogin.headers['set-cookie'];
        // 3. Login as Agent (Dev Sharma)
        const agentLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { email: 'dev.sharma@arvo.internal' }
        });
        (0, vitest_1.expect)(agentLogin.statusCode).toBe(200);
        agentCookie = agentLogin.headers['set-cookie'];
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    // --------------------------------------------------------------------------
    // 1. LEAD DASHBOARD ANALYTICS & ROOT CAUSE ATTRIBUTION
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('1. Role authorization: Agent is rejected with 403, Lead gets 200 with full KPI analytics', async () => {
        // Agent attempt
        const agentRes = await app.inject({
            method: 'GET',
            url: '/api/analytics/lead-dashboard',
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(agentRes.statusCode).toBe(403);
        // Lead attempt
        const leadRes = await app.inject({
            method: 'GET',
            url: '/api/analytics/lead-dashboard',
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(leadRes.statusCode).toBe(200);
        const body = leadRes.json();
        (0, vitest_1.expect)(body.kpis).toBeDefined();
        (0, vitest_1.expect)(typeof body.kpis.response_compliance_pct).toBe('number');
        (0, vitest_1.expect)(typeof body.kpis.resolution_compliance_pct).toBe('number');
        (0, vitest_1.expect)(typeof body.kpis.currently_late).toBe('number');
        (0, vitest_1.expect)(body.kpis.waiting_on_customer).toBeGreaterThanOrEqual(1);
        // Charts data
        (0, vitest_1.expect)(body.charts).toBeDefined();
        (0, vitest_1.expect)(Array.isArray(body.charts.late_over_time)).toBe(true);
        (0, vitest_1.expect)(Array.isArray(body.charts.breach_reasons)).toBe(true);
        (0, vitest_1.expect)(Array.isArray(body.charts.workload_per_agent)).toBe(true);
        (0, vitest_1.expect)(body.charts.workload_per_agent.length).toBeGreaterThanOrEqual(9);
        // Late tickets table
        (0, vitest_1.expect)(Array.isArray(body.late_tickets)).toBe(true);
        (0, vitest_1.expect)(body.late_tickets.length).toBeGreaterThanOrEqual(1);
        const sampleLate = body.late_tickets[0];
        (0, vitest_1.expect)(sampleLate.human_id).toMatch(/^INC-/);
        (0, vitest_1.expect)(sampleLate.why_late).toBeDefined();
        (0, vitest_1.expect)(sampleLate.why_late_label).toBeDefined();
        (0, vitest_1.expect)(typeof sampleLate.customer_wait_minutes_excluded).toBe('number');
    });
    (0, vitest_1.it)('2. Filtered queries: correctly filters dashboard data by priority and agent', async () => {
        const urgentRes = await app.inject({
            method: 'GET',
            url: '/api/analytics/lead-dashboard?priority=urgent',
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(urgentRes.statusCode).toBe(200);
        const urgentBody = urgentRes.json();
        // All returned late tickets must be urgent
        for (const t of urgentBody.late_tickets) {
            (0, vitest_1.expect)(t.priority).toBe('urgent');
        }
    });
    (0, vitest_1.it)('3. Internal CSV Export: includes confidential header and internal staff attribution columns', async () => {
        const csvRes = await app.inject({
            method: 'GET',
            url: '/api/analytics/export-csv',
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(csvRes.statusCode).toBe(200);
        (0, vitest_1.expect)(csvRes.headers['content-type']).toContain('text/csv');
        (0, vitest_1.expect)(csvRes.headers['content-disposition']).toContain('attachment');
        const csvText = csvRes.body;
        (0, vitest_1.expect)(csvText).toContain('ARVO SYSTEMS - LEAD AUDIT & SLA REPORT');
        (0, vitest_1.expect)(csvText).toContain('WARNING: CONTAINS INTERNAL DATA');
        (0, vitest_1.expect)(csvText).toContain('"Ticket ID"');
        (0, vitest_1.expect)(csvText).toContain('"Why Late"');
        (0, vitest_1.expect)(csvText).toContain('"Assignee"');
    });
    // --------------------------------------------------------------------------
    // 2. ADMIN HOLIDAY CALENDAR MANAGEMENT
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('4. Holiday Calendar: lists, provisions new holiday with audit logging, and deletes it', async () => {
        // 1. List holidays
        const listRes = await app.inject({
            method: 'GET',
            url: '/api/admin/holidays',
            headers: { cookie: adminCookie }
        });
        (0, vitest_1.expect)(listRes.statusCode).toBe(200);
        const initialHolidays = listRes.json().holidays;
        (0, vitest_1.expect)(initialHolidays.length).toBeGreaterThanOrEqual(5);
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
        (0, vitest_1.expect)(createRes.statusCode).toBe(201);
        const created = createRes.json().holiday;
        (0, vitest_1.expect)(created.name).toBe('Arvo Foundation Day');
        // Verify audit event
        const db = await (0, client_js_1.getDbClient)();
        const auditRes = await db.query(`SELECT * FROM audit_events WHERE event_type = 'holiday_created' ORDER BY seq DESC LIMIT 1`);
        (0, vitest_1.expect)(auditRes.rows.length).toBe(1);
        (0, vitest_1.expect)(auditRes.rows[0].after.name).toBe('Arvo Foundation Day');
        // 3. Delete holiday
        const delRes = await app.inject({
            method: 'DELETE',
            url: `/api/admin/holidays/${created.id}`,
            headers: { cookie: adminCookie }
        });
        (0, vitest_1.expect)(delRes.statusCode).toBe(200);
        (0, vitest_1.expect)(delRes.json().success).toBe(true);
        const auditDelRes = await db.query(`SELECT * FROM audit_events WHERE event_type = 'holiday_deleted' ORDER BY seq DESC LIMIT 1`);
        (0, vitest_1.expect)(auditDelRes.rows.length).toBe(1);
    });
    // --------------------------------------------------------------------------
    // 3. SLA POLICIES & SYSTEM SETTINGS GOVERNANCE (FUTURE CALCULATIONS RULE)
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('5. SLA Policies & Settings: modifies policy and settings with audit trail and future-only notice', async () => {
        // 1. List SLA policies
        const policiesRes = await app.inject({
            method: 'GET',
            url: '/api/admin/sla-policies',
            headers: { cookie: adminCookie }
        });
        (0, vitest_1.expect)(policiesRes.statusCode).toBe(200);
        (0, vitest_1.expect)(policiesRes.json().policies.length).toBe(3);
        // 2. Update urgent policy
        const patchPolicyRes = await app.inject({
            method: 'PATCH',
            url: '/api/admin/sla-policies/urgent',
            headers: { cookie: adminCookie },
            payload: {
                respond_minutes: 150
            }
        });
        (0, vitest_1.expect)(patchPolicyRes.statusCode).toBe(200);
        const policyBody = patchPolicyRes.json();
        (0, vitest_1.expect)(policyBody.policy.respond_minutes).toBe(150);
        (0, vitest_1.expect)(policyBody.notice).toContain('Applies strictly to future ticket computations');
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
        (0, vitest_1.expect)(patchSettingRes.statusCode).toBe(200);
        const settingBody = patchSettingRes.json();
        (0, vitest_1.expect)(settingBody.setting.value).toBe(2800);
        (0, vitest_1.expect)(settingBody.notice).toContain('Applies strictly to future ticket computations');
        // Verify audit events
        const db = await (0, client_js_1.getDbClient)();
        const policyAudit = await db.query(`SELECT * FROM audit_events WHERE event_type = 'sla_policy_updated' ORDER BY seq DESC LIMIT 1`);
        (0, vitest_1.expect)(policyAudit.rows.length).toBe(1);
        (0, vitest_1.expect)(policyAudit.rows[0].after.respond_minutes).toBe(150);
        const settingAudit = await db.query(`SELECT * FROM audit_events WHERE event_type = 'settings_updated' ORDER BY seq DESC LIMIT 1`);
        (0, vitest_1.expect)(settingAudit.rows.length).toBe(1);
        (0, vitest_1.expect)(settingAudit.rows[0].after.value).toBe(2800);
    });
    // --------------------------------------------------------------------------
    // 4. CANNED REPLIES & USER PROVISIONING
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('6. Canned Replies: provisions, edits, and deletes macros', async () => {
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
        (0, vitest_1.expect)(createRes.statusCode).toBe(201);
        const reply = createRes.json().canned_reply;
        (0, vitest_1.expect)(reply.shortcut).toBe('/netlog');
        // 2. Patch canned reply
        const patchRes = await app.inject({
            method: 'PATCH',
            url: `/api/canned-replies/${reply.id}`,
            headers: { cookie: leadCookie },
            payload: {
                title: 'Updated Network Diagnostics'
            }
        });
        (0, vitest_1.expect)(patchRes.statusCode).toBe(200);
        (0, vitest_1.expect)(patchRes.json().canned_reply.title).toBe('Updated Network Diagnostics');
        // 3. Delete canned reply
        const delRes = await app.inject({
            method: 'DELETE',
            url: `/api/canned-replies/${reply.id}`,
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(delRes.statusCode).toBe(200);
        (0, vitest_1.expect)(delRes.json().success).toBe(true);
    });
    (0, vitest_1.it)('7. Admin Users: creates new agent, modifies role, and audits transitions', async () => {
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
        (0, vitest_1.expect)(createRes.statusCode).toBe(201);
        const newUser = createRes.json().user;
        (0, vitest_1.expect)(newUser.name).toBe('Tanya Sen');
        (0, vitest_1.expect)(newUser.role).toBe('agent');
        // 2. Promote to Lead
        const patchRes = await app.inject({
            method: 'PATCH',
            url: `/api/admin/users/${newUser.id}`,
            headers: { cookie: adminCookie },
            payload: {
                role: 'lead'
            }
        });
        (0, vitest_1.expect)(patchRes.statusCode).toBe(200);
        (0, vitest_1.expect)(patchRes.json().user.role).toBe('lead');
        // Verify audit
        const db = await (0, client_js_1.getDbClient)();
        const auditRes = await db.query(`SELECT * FROM audit_events WHERE event_type = 'user_updated' ORDER BY seq DESC LIMIT 1`);
        (0, vitest_1.expect)(auditRes.rows.length).toBe(1);
        (0, vitest_1.expect)(auditRes.rows[0].after.role).toBe('lead');
    });
});
//# sourceMappingURL=lead-dashboard-and-admin.test.js.map