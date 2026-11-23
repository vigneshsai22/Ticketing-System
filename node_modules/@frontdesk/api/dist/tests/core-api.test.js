"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_js_1 = require("../app.js");
const client_js_1 = require("../db/client.js");
const migrate_js_1 = require("../db/migrate.js");
const seed_stub_js_1 = require("../db/seed-stub.js");
const shared_1 = require("@frontdesk/shared");
(0, vitest_1.describe)('Frontdesk Core API Suite', () => {
    let app;
    let db;
    let clock;
    let leadCookie;
    let agentCookie;
    (0, vitest_1.beforeAll)(async () => {
        clock = new shared_1.ShiftableClock();
        // Pin to working time: Monday 2026-03-02 10:00:00 Asia/Kolkata
        clock.set('2026-03-02T04:30:00.000Z', true);
        await (0, migrate_js_1.runMigrations)();
        await (0, seed_stub_js_1.runStubSeed)();
        db = await (0, client_js_1.getDbClient)();
        app = await (0, app_js_1.buildApp)({ clock });
        await app.ready();
        // Log in as Lead (Aria Chen)
        const leadLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { role: 'lead' }
        });
        (0, vitest_1.expect)(leadLogin.statusCode).toBe(200);
        const leadCookies = leadLogin.cookies;
        leadCookie = `${leadCookies[0].name}=${leadCookies[0].value}`;
        // Log in as Agent (Dev Sharma)
        const agentLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { email: 'dev.sharma@arvo.internal' }
        });
        (0, vitest_1.expect)(agentLogin.statusCode).toBe(200);
        const agentCookies = agentLogin.cookies;
        agentCookie = `${agentCookies[0].name}=${agentCookies[0].value}`;
    });
    (0, vitest_1.afterAll)(async () => {
        if (app)
            await app.close();
        if (db)
            await db.close();
    });
    // --------------------------------------------------------------------------
    // 1. Auth & Session Tests
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Auth: demo login sets session cookie and returns user profile', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/demo-login',
            payload: { role: 'admin' }
        });
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        const body = res.json();
        (0, vitest_1.expect)(body.user.role).toBe('admin');
        (0, vitest_1.expect)(body.user.name).toBe('Kiran Patel');
        (0, vitest_1.expect)(res.headers['set-cookie']).toBeDefined();
    });
    (0, vitest_1.it)('Auth: protected route rejects unauthenticated request with 401', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/tickets'
        });
        (0, vitest_1.expect)(res.statusCode).toBe(401);
    });
    (0, vitest_1.it)('Auth: role guard allows lead but forbids agent from reassigning', async () => {
        // 1. Create a ticket
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: leadCookie },
            payload: { subject: 'Database high load', priority: 'urgent' }
        });
        const ticketId = createRes.json().ticket.id;
        // 2. Agent attempts reassign -> 403 Forbidden
        const agentReassign = await app.inject({
            method: 'POST',
            url: `/api/tickets/${ticketId}/reassign`,
            headers: { cookie: agentCookie },
            payload: { assigneeId: '00000000-0000-0000-0000-000000000001' }
        });
        (0, vitest_1.expect)(agentReassign.statusCode).toBe(403);
        // 3. Lead attempts reassign -> succeeds (or fails on valid user id)
        const usersRes = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['agent']);
        const targetAgentId = usersRes.rows[0].id;
        const leadReassign = await app.inject({
            method: 'POST',
            url: `/api/tickets/${ticketId}/reassign`,
            headers: { cookie: leadCookie },
            payload: { assigneeId: targetAgentId }
        });
        (0, vitest_1.expect)(leadReassign.statusCode).toBe(200);
        (0, vitest_1.expect)(leadReassign.json().ticket.assignee_id).toBe(targetAgentId);
    });
    // --------------------------------------------------------------------------
    // 2. Ticket Creation, SLA Deadlines & Audit Trail
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('Ticket Creation: creates cycle 1, computes deadlines via SLA engine, records audit event', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'VPN Tunnel broken', priority: 'urgent' }
        });
        (0, vitest_1.expect)(res.statusCode).toBe(201);
        const ticket = res.json().ticket;
        (0, vitest_1.expect)(ticket.human_id).toMatch(/^INC-\d{4}$/);
        (0, vitest_1.expect)(ticket.priority).toBe('urgent');
        (0, vitest_1.expect)(ticket.status).toBe('new');
        (0, vitest_1.expect)(ticket.version).toBe(1);
        // Verify ticket cycle in DB
        const cycleRes = await db.query('SELECT * FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = 1', [ticket.id]);
        (0, vitest_1.expect)(cycleRes.rows.length).toBe(1);
        const cycle = cycleRes.rows[0];
        (0, vitest_1.expect)(cycle.response_due).toBeDefined();
        (0, vitest_1.expect)(cycle.resolve_due).toBeDefined();
        // Verify audit events
        const auditRes = await app.inject({
            method: 'GET',
            url: `/api/tickets/${ticket.id}/audit`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(auditRes.statusCode).toBe(200);
        const events = auditRes.json().events;
        (0, vitest_1.expect)(events.length).toBe(1);
        (0, vitest_1.expect)(events[0].event_type).toBe('ticket_created');
        (0, vitest_1.expect)(events[0].prev_hash).toBe('GENESIS');
        (0, vitest_1.expect)(events[0].hash).toMatch(/^[a-f0-9]{64}$/);
    });
    // --------------------------------------------------------------------------
    // 3. Status State Machine & Pause/Resume Bookkeeping
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('State Machine: allows legal transitions (new -> in_progress -> waiting_on_customer -> in_progress -> resolved)', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Billing inquiry', priority: 'medium' }
        });
        const ticketId = createRes.json().ticket.id;
        // new -> in_progress
        const t1 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'in_progress', version: 1 }
        });
        (0, vitest_1.expect)(t1.statusCode).toBe(200);
        (0, vitest_1.expect)(t1.json().ticket.status).toBe('in_progress');
        (0, vitest_1.expect)(t1.json().ticket.version).toBe(2);
        // in_progress -> waiting_on_customer (triggers SLA pause)
        const t2 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'waiting_on_customer', version: 2 }
        });
        (0, vitest_1.expect)(t2.statusCode).toBe(200);
        // Verify pause record was inserted
        const pauseRes = await db.query('SELECT * FROM sla_pauses WHERE ticket_id = $1 AND ended_at IS NULL', [ticketId]);
        (0, vitest_1.expect)(pauseRes.rows.length).toBe(1);
        // waiting_on_customer -> in_progress (triggers SLA pause resume & deadline recalculation)
        const t3 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'in_progress', version: 3 }
        });
        (0, vitest_1.expect)(t3.statusCode).toBe(200);
        // Verify active pause was closed
        const activePauses = await db.query('SELECT * FROM sla_pauses WHERE ticket_id = $1 AND ended_at IS NULL', [ticketId]);
        (0, vitest_1.expect)(activePauses.rows.length).toBe(0);
        // in_progress -> resolved
        const t4 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'resolved', version: 4 }
        });
        (0, vitest_1.expect)(t4.statusCode).toBe(200);
        (0, vitest_1.expect)(t4.json().ticket.status).toBe('resolved');
    });
    (0, vitest_1.it)('State Machine: rejects illegal status transitions with 400', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Edge router flap', priority: 'urgent' }
        });
        const ticketId = createRes.json().ticket.id;
        // Illegal: new -> closed
        const illegal1 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'closed' }
        });
        (0, vitest_1.expect)(illegal1.statusCode).toBe(400);
        (0, vitest_1.expect)(illegal1.json().error).toContain("Illegal status transition from 'new' to 'closed'");
        // Illegal: new -> resolved
        const illegal2 = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'resolved' }
        });
        (0, vitest_1.expect)(illegal2.statusCode).toBe(400);
    });
    (0, vitest_1.it)('Optimistic Locking: rejects update when version does not match', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Account lockout', priority: 'low' }
        });
        const ticketId = createRes.json().ticket.id;
        // Stale version (ticket is at version 1, client sends version 99)
        const staleRes = await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'open', version: 99 }
        });
        (0, vitest_1.expect)(staleRes.statusCode).toBe(409);
        (0, vitest_1.expect)(staleRes.json().error).toContain('Optimistic lock conflict');
    });
    // --------------------------------------------------------------------------
    // 4. INC-0291: 20 Parallel Claims Test
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('INC-0291: 20 parallel claims -> EXACTLY ONE wins, 19 receive 409 with owner name', async () => {
        // 1. Create an unclaimed ticket
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: leadCookie },
            payload: { subject: 'Production Outage Severity 1', priority: 'urgent' }
        });
        const ticketId = createRes.json().ticket.id;
        // 2. Query 20 agents (or simulate 20 agent sessions)
        const userRes = await db.query('SELECT * FROM users');
        const users = userRes.rows;
        // Prepare 20 JWT tokens/cookies
        const agentCookiesList = [];
        for (let i = 0; i < 20; i++) {
            const u = users[i % users.length];
            const token = app.jwt.sign({ id: u.id, email: u.email, name: u.name, role: u.role });
            agentCookiesList.push(`frontdesk_session=${token}`);
        }
        // 3. Fire 20 parallel claim requests simultaneously
        const claimPromises = agentCookiesList.map(cookie => app.inject({
            method: 'POST',
            url: `/api/tickets/${ticketId}/claim`,
            headers: { cookie }
        }));
        const responses = await Promise.all(claimPromises);
        // 4. Count wins and conflicts
        const successes = responses.filter(r => r.statusCode === 200);
        const conflicts = responses.filter(r => r.statusCode === 409);
        (0, vitest_1.expect)(successes.length).toBe(1);
        (0, vitest_1.expect)(conflicts.length).toBe(19);
        const winnerBody = successes[0].json();
        const winningTicket = winnerBody.ticket;
        (0, vitest_1.expect)(winningTicket.assignee_id).toBeDefined();
        // 5. Verify every 409 response includes the winner's name
        const winningUser = users.find(u => u.id === winningTicket.assignee_id);
        for (const conflict of conflicts) {
            const json = conflict.json();
            (0, vitest_1.expect)(json.error).toBe('Ticket already claimed');
            (0, vitest_1.expect)(json.current_assignee).toBe(winningUser?.name);
        }
    });
    // --------------------------------------------------------------------------
    // 5. INC-0318: Audit Chain Tamper Detection Test
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('INC-0318: verifyTicketAuditChain detects tampered row', async () => {
        // 1. Create a ticket and perform mutations to build a hash chain
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            headers: { cookie: agentCookie },
            payload: { subject: 'Integrity Check Ticket', priority: 'medium' }
        });
        const ticketId = createRes.json().ticket.id;
        await app.inject({
            method: 'POST',
            url: `/api/tickets/${ticketId}/claim`,
            headers: { cookie: agentCookie }
        });
        await app.inject({
            method: 'PATCH',
            url: `/api/tickets/${ticketId}/status`,
            headers: { cookie: agentCookie },
            payload: { status: 'in_progress', version: 2 }
        });
        // 2. Verify untampered chain is valid
        const cleanVerify = await app.inject({
            method: 'GET',
            url: `/api/tickets/${ticketId}/audit/verify`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(cleanVerify.statusCode).toBe(200);
        (0, vitest_1.expect)(cleanVerify.json().valid).toBe(true);
        (0, vitest_1.expect)(cleanVerify.json().totalEvents).toBe(3);
        // 3. Simulate superuser tampering:
        // Temporarily disable the immutability trigger, tamper the payload, then re-enable trigger
        await db.exec('ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutable');
        await db.query(`UPDATE audit_events 
       SET after = '{"status":"fraudulent_tamper"}'::jsonb 
       WHERE ticket_id = $1 AND event_type = 'status_changed'`, [ticketId]);
        await db.exec('ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutable');
        // 4. Verify chain now FAILS and identifies the tampered link
        const tamperedVerify = await app.inject({
            method: 'GET',
            url: `/api/tickets/${ticketId}/audit/verify`,
            headers: { cookie: agentCookie }
        });
        (0, vitest_1.expect)(tamperedVerify.statusCode).toBe(200);
        const result = tamperedVerify.json();
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.reason).toContain('Cryptographic payload digest mismatch');
        (0, vitest_1.expect)(result.brokenAtSeq).toBeDefined();
        (0, vitest_1.expect)(result.expectedHash).not.toBe(result.actualHash);
    });
});
//# sourceMappingURL=core-api.test.js.map