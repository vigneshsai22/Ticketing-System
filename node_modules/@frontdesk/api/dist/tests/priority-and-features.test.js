"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_js_1 = require("../app.js");
const client_js_1 = require("../db/client.js");
const migrate_js_1 = require("../db/migrate.js");
const seed_stub_js_1 = require("../db/seed-stub.js");
const shared_1 = require("@frontdesk/shared");
const canary_registry_js_1 = require("../services/canary-registry.js");
(0, vitest_1.describe)('Priority Upgrades, SSE, Search, Canned Replies, Intake, Outbox & Canary Registry', () => {
    let app;
    let db;
    let clock;
    let leadCookie;
    let agentCookie;
    let adminCookie;
    (0, vitest_1.beforeAll)(async () => {
        clock = new shared_1.ShiftableClock();
        // Monday 2026-03-02 10:00:00 Asia/Kolkata
        clock.set('2026-03-02T04:30:00.000Z', true);
        await (0, migrate_js_1.runMigrations)();
        await (0, seed_stub_js_1.runStubSeed)();
        db = await (0, client_js_1.getDbClient)();
        app = await (0, app_js_1.buildApp)({ clock });
        await app.ready();
        // Lead Login (Aria Chen)
        const leadLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { role: 'lead' }
        });
        leadCookie = `${leadLogin.cookies[0].name}=${leadLogin.cookies[0].value}`;
        // Agent Login (Dev Sharma)
        const agentLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { email: 'dev.sharma@arvo.internal' }
        });
        agentCookie = `${agentLogin.cookies[0].name}=${agentLogin.cookies[0].value}`;
        // Admin Login (Kiran Patel)
        const adminLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { role: 'admin' }
        });
        adminCookie = `${adminLogin.cookies[0].name}=${adminLogin.cookies[0].value}`;
    });
    (0, vitest_1.afterAll)(async () => {
        if (app)
            await app.close();
        if (db)
            await db.close();
    });
    // --------------------------------------------------------------------------
    // 1. Priority Change (PATCH /tickets/:id/priority)
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Priority Change: requires a reason and rejects empty reason with 400', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Database index rebuild', priority: 'low' }
        });
        const ticketId = createRes.json().ticket.id;
        const noReasonRes = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/priority`,
            headers: { cookie: agentCookie },
            payload: { priority: 'urgent' }
        });
        (0, vitest_1.expect)(noReasonRes.statusCode).toBe(400);
        (0, vitest_1.expect)(noReasonRes.json().error).toContain('reason is strictly required');
    });
    (0, vitest_1.it)('Priority Change: mid-flight escalation recomputes deadlines & flags escalated_mid_flight breach', async () => {
        // Ticket starts Monday 10:00 as Low (540m respond).
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Payroll service glitch', priority: 'low' }
        });
        const ticketId = createRes.json().ticket.id;
        // Shift time forward by 3 hours (180 business minutes) to Monday 13:00
        clock.shiftByHours(3);
        // Escalate to Urgent (120m respond from 10:00 = 12:00 deadline -> already past!)
        const updateRes = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/priority`,
            headers: { cookie: agentCookie },
            payload: {
                priority: 'urgent',
                reason: 'Client CFO reports all payroll runs blocked'
            }
        });
        (0, vitest_1.expect)(updateRes.statusCode).toBe(200);
        const body = updateRes.json();
        (0, vitest_1.expect)(body.ticket.priority).toBe('urgent');
        (0, vitest_1.expect)(body.recompute.response_breached).toBe(true);
        (0, vitest_1.expect)(body.recompute.response_breach_reason).toBe('escalated_mid_flight');
        (0, vitest_1.expect)(body.recompute.is_escalated_mid_flight).toBe(true);
        // Check audit event
        const auditRes = await app.inject({
            method: 'GET',
            url: `/api/tickets/${ticketId}/audit`,
            headers: { cookie: agentCookie }
        });
        const events = auditRes.json().events;
        const priorityEvent = events.find((e) => e.event_type === 'priority_changed');
        (0, vitest_1.expect)(priorityEvent).toBeDefined();
        (0, vitest_1.expect)(priorityEvent.before.priority).toBe('low');
        (0, vitest_1.expect)(priorityEvent.after.priority).toBe('urgent');
        (0, vitest_1.expect)(priorityEvent.after.reason).toContain('Client CFO reports');
        // Reset clock back
        clock.reset();
        clock.set('2026-03-02T04:30:00.000Z', true);
    });
    (0, vitest_1.it)('Priority Change: rejects optimistic lock mismatch with 409', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'SSO configuration', priority: 'medium' }
        });
        const ticketId = createRes.json().ticket.id;
        const staleRes = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/priority`,
            headers: { cookie: agentCookie },
            payload: { priority: 'urgent', reason: 'Critical blocker', version: 99 }
        });
        (0, vitest_1.expect)(staleRes.statusCode).toBe(409);
        (0, vitest_1.expect)(staleRes.json().error).toContain('Optimistic lock conflict');
    });
    // --------------------------------------------------------------------------
    // 2. SSE Events & Presence
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('SSE & Presence: broadcasts presence events with IDs and metadata only', async () => {
        const presenceRes = await app.inject({
            method: 'POST',
            url: '/api/events/presence',
            headers: { cookie: agentCookie },
            payload: { ticket_id: '00000000-0000-0000-0000-000000000001', action: 'viewing' }
        });
        (0, vitest_1.expect)(presenceRes.statusCode).toBe(200);
        (0, vitest_1.expect)(presenceRes.json().success).toBe(true);
    });
    // --------------------------------------------------------------------------
    // 3. Search: Public vs Internal-Only Code Paths
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Search: public search strictly excludes internal notes, internal search includes them with snippets', async () => {
        // 1. Create a ticket
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Public Subject Alpha', priority: 'medium' }
        });
        const ticketId = createRes.json().ticket.id;
        // 2. Add an internal note with a secret keyword
        const secretKeyword = `CLASSIFIED_NOTE_${Math.random().toString(36).substring(2)}`;
        const userRes = await db.query('SELECT id FROM users WHERE email = $1', ['dev.sharma@arvo.internal']);
        const agentId = userRes.rows[0].id;
        await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)`, [ticketId, agentId, `Internal discussion: Customer might churn. Secret: ${secretKeyword}`]);
        // 3. Public search with secret keyword -> MUST BE EMPTY
        const publicSearch = await app.inject({
            method: 'GET',
            url: `/api/search?q=${secretKeyword}`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(publicSearch.statusCode).toBe(200);
        (0, vitest_1.expect)(publicSearch.json().results.length).toBe(0);
        // 4. Internal search with secret keyword -> MUST FIND IT with snippet
        const internalSearch = await app.inject({
            method: 'GET',
            url: `/api/search/internal?q=${secretKeyword}`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(internalSearch.statusCode).toBe(200);
        const internalResults = internalSearch.json().results;
        (0, vitest_1.expect)(internalResults.length).toBe(1);
        (0, vitest_1.expect)(internalResults[0].id).toBe(ticketId);
        (0, vitest_1.expect)(internalResults[0].match_source).toBe('internal_note');
        (0, vitest_1.expect)(internalResults[0].snippet).toContain(secretKeyword);
    });
    // --------------------------------------------------------------------------
    // 4. Canned Replies CRUD
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Canned Replies: lead can create, update, delete; agent can list and use', async () => {
        // Lead creates canned reply
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/canned-replies',
            headers: { cookie: leadCookie },
            payload: {
                title: 'Greeting Standard',
                content: 'Hello, thank you for reaching out to Arvo Systems Support. We are investigating your issue.',
                shortcut: '/greet',
                category: 'greetings'
            }
        });
        (0, vitest_1.expect)(createRes.statusCode).toBe(201);
        const replyId = createRes.json().canned_reply.id;
        // Agent lists canned replies
        const listRes = await app.inject({
            method: 'GET',
            url: '/api/canned-replies',
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(listRes.statusCode).toBe(200);
        (0, vitest_1.expect)(listRes.json().canned_replies.some((c) => c.id === replyId)).toBe(true);
        // Regular agent cannot delete canned reply -> 403 Forbidden
        const agentDelete = await app.inject({
            method: 'DELETE',
            url: `/api/canned-replies/${replyId}`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(agentDelete.statusCode).toBe(403);
        // Lead deletes canned reply
        const leadDelete = await app.inject({
            method: 'DELETE',
            url: `/api/canned-replies/${replyId}`,
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(leadDelete.statusCode).toBe(200);
    });
    // --------------------------------------------------------------------------
    // 5. Agent Intake on behalf of customer (Phone/Email)
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Intake: creates customer if new, creates ticket, records initial message and enqueues outbox email', async () => {
        const intakeEmail = `vip.client.${Math.random().toString(36).substring(2)}@acme.org`;
        const intakeRes = await app.inject({
            method: 'POST',
            url: '/api/tickets/intake',
            headers: { cookie: agentCookie },
            payload: {
                channel: 'phone',
                customer: {
                    email: intakeEmail,
                    name: 'Victoria Vance',
                    organization: 'Acme International'
                },
                subject: 'Hardware failure reported over phone',
                priority: 'urgent',
                initialMessage: 'Customer called stating server PSU failed in rack 4.'
            }
        });
        (0, vitest_1.expect)(intakeRes.statusCode).toBe(201);
        const body = intakeRes.json();
        (0, vitest_1.expect)(body.ticket.subject).toContain('Hardware failure');
        (0, vitest_1.expect)(body.customer.email).toBe(intakeEmail);
        // Verify outbox email was queued
        const outboxRes = await app.inject({
            method: 'GET',
            url: `/api/admin/outbox?recipient=${intakeEmail}`,
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(outboxRes.statusCode).toBe(200);
        const emails = outboxRes.json().outbox;
        (0, vitest_1.expect)(emails.length).toBe(1);
        (0, vitest_1.expect)(emails[0].template).toBe('ticket_created');
        (0, vitest_1.expect)(emails[0].body).toContain('Victoria Vance');
    });
    // --------------------------------------------------------------------------
    // 6. Admin User Management
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Admin User Management: admin can create, change role, deactivate agents (all audited)', async () => {
        const newAgentEmail = `intern.${Math.random().toString(36).substring(2)}@arvo.internal`;
        // 1. Create user
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/admin/users',
            headers: { cookie: adminCookie },
            payload: {
                email: newAgentEmail,
                name: 'Jordan Lee',
                role: 'agent'
            }
        });
        (0, vitest_1.expect)(createRes.statusCode).toBe(201);
        const userId = createRes.json().user.id;
        // 2. Change role to lead
        const updateRole = await app.inject({
            method: 'PATCH',
            url: `/api/admin/users/${userId}`,
            headers: { cookie: adminCookie },
            payload: { role: 'lead' }
        });
        (0, vitest_1.expect)(updateRole.statusCode).toBe(200);
        (0, vitest_1.expect)(updateRole.json().user.role).toBe('lead');
        // 3. Deactivate user
        const deactivateRes = await app.inject({
            method: 'PATCH',
            url: `/api/admin/users/${userId}`,
            headers: { cookie: adminCookie },
            payload: { active: false }
        });
        (0, vitest_1.expect)(deactivateRes.statusCode).toBe(200);
        (0, vitest_1.expect)(deactivateRes.json().user.active).toBe(false);
        // 4. Non-admin receives 403 Forbidden
        const forbiddenRes = await app.inject({
            method: 'POST',
            url: '/api/admin/users',
            headers: { cookie: agentCookie },
            payload: { email: 'unauthorized@arvo.internal', name: 'Hacker', role: 'admin' }
        });
        (0, vitest_1.expect)(forbiddenRes.statusCode).toBe(403);
    });
    // --------------------------------------------------------------------------
    // 7. Outbox Viewer Endpoint
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Outbox Viewer: lead and admin can view outbox emails with filters', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/admin/outbox?status=pending',
            headers: { cookie: leadCookie }
        });
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.json().outbox)).toBe(true);
        // Agent cannot view outbox
        const agentRes = await app.inject({
            method: 'GET',
            url: '/api/admin/outbox',
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(agentRes.statusCode).toBe(403);
    });
    // --------------------------------------------------------------------------
    // 8. Canary Leak Test Registry (Zero Note Leakage Verification)
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Canary Registry: verifies zero internal note leakage across all customer surfaces', async () => {
        const canaryToken = `CANARY_TOP_SECRET_${Math.random().toString(36).substring(2)}_DO_NOT_LEAK`;
        // 1. Seed the canary token in an internal note
        const custRes = await db.query('SELECT id FROM customers LIMIT 1');
        const userRes = await db.query('SELECT id FROM users LIMIT 1');
        const ticketRes = await db.query(`INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Canary Test Ticket', 'low', 'open', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`, [custRes.rows[0].id]);
        const ticketId = ticketRes.rows[0].id;
        await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)`, [ticketId, userRes.rows[0].id, `Privileged diagnosis: ${canaryToken}`]);
        // 2. Run canary leak check across all registered customer surfaces
        const checkResults = await (0, canary_registry_js_1.runCanaryLeakCheck)(db, canaryToken);
        (0, vitest_1.expect)(checkResults.length).toBeGreaterThanOrEqual(5);
        // Assert NO surface leaked the canary token
        for (const result of checkResults) {
            (0, vitest_1.expect)(result.leaked, `Leak in surface: ${result.surfaceName}`).toBe(false);
        }
    });
});
//# sourceMappingURL=priority-and-features.test.js.map