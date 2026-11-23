"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_1 = require("@frontdesk/shared");
const app_js_1 = require("../app.js");
const client_js_1 = require("../db/client.js");
const seed_js_1 = require("../db/seed.js");
const scheduler_service_js_1 = require("../services/scheduler.service.js");
(0, vitest_1.describe)('Scheduler, Time Machine & Incidents Test Suite', () => {
    let app;
    let db;
    let clock;
    (0, vitest_1.beforeAll)(async () => {
        clock = new shared_1.ShiftableClock('2026-03-06T18:00:00.000+05:30', false);
        app = await (0, app_js_1.buildApp)({ clock });
        await app.ready();
        db = await (0, client_js_1.getDbClient)();
        // Run the full seed
        await (0, seed_js_1.runFullSeed)(db);
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
        await db.close();
    });
    (0, vitest_1.beforeEach)(() => {
        // Reset clock to Friday 18:00 before each test
        clock.set('2026-03-06T18:00:00.000+05:30', false);
    });
    (0, vitest_1.it)('1. Seed verification: contains Arvo 9 agents + lead + admin, policies, and 40 tickets', async () => {
        // Check staff count
        const usersRes = await db.query('SELECT count(*) as count FROM users WHERE active = TRUE');
        (0, vitest_1.expect)(Number(usersRes.rows[0].count)).toBe(11); // 1 lead + 1 admin + 9 agents
        // Check SLA policies
        const policiesRes = await db.query('SELECT count(*) as count FROM sla_policies');
        (0, vitest_1.expect)(Number(policiesRes.rows[0].count)).toBe(3);
        // Check ticket count
        const ticketsRes = await db.query('SELECT count(*) as count FROM tickets');
        (0, vitest_1.expect)(Number(ticketsRes.rows[0].count)).toBe(40);
        // Verify INC-0001 (Friday 18:00 urgent ticket)
        const inc1 = await db.query(`SELECT t.human_id, t.priority, t.status, tc.response_due, tc.resolve_due
       FROM tickets t
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.human_id = 'INC-0001'`);
        (0, vitest_1.expect)(inc1.rows.length).toBe(1);
        (0, vitest_1.expect)(inc1.rows[0].priority).toBe('urgent');
        (0, vitest_1.expect)(inc1.rows[0].status).toBe('open');
        // Mon 09:30 + 90m = 11:00 (since 30m elapsed on Friday 18:00-18:30)
        (0, vitest_1.expect)(new Date(inc1.rows[0].response_due).toISOString()).toBe(new Date('2026-03-09T11:00:00.000+05:30').toISOString());
        // End of Monday = 18:30
        (0, vitest_1.expect)(new Date(inc1.rows[0].resolve_due).toISOString()).toBe(new Date('2026-03-09T18:30:00.000+05:30').toISOString());
    });
    (0, vitest_1.it)('2. Friday 6 PM Scenario: Sunday not late, Monday 10:55 not late, Monday 11:01 breaches response', async () => {
        // Clock at Friday 18:00:00+05:30
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        // Initial check: INC-0001 (Friday 18:00 urgent ticket) is not breached
        const checkFri = await db.query(`SELECT tc.response_breached_at 
       FROM tickets t 
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.human_id = 'INC-0001'`);
        (0, vitest_1.expect)(checkFri.rows[0].response_breached_at).toBeNull();
        // Jump to Sunday noon (2026-03-08 12:00:00+05:30)
        clock.set('2026-03-08T12:00:00.000+05:30', false);
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        // Check INC-0001 is NOT late on Sunday
        const checkSunday = await db.query(`SELECT tc.response_breached_at 
       FROM tickets t 
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.human_id = 'INC-0001'`);
        (0, vitest_1.expect)(checkSunday.rows[0].response_breached_at).toBeNull();
        // Jump to Monday 10:55:00+05:30 (5 minutes before response deadline)
        clock.set('2026-03-09T10:55:00.000+05:30', false);
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        const checkMonPre = await db.query(`SELECT tc.response_breached_at 
       FROM tickets t 
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.human_id = 'INC-0001'`);
        (0, vitest_1.expect)(checkMonPre.rows[0].response_breached_at).toBeNull();
        // Jump to Monday 11:01:00+05:30 (1 minute past response deadline)
        clock.set('2026-03-09T11:01:00.000+05:30', false);
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        // Verify INC-0001 recorded breach
        const checkMonPost = await db.query(`SELECT tc.response_breached_at, tc.response_breach_reason, t.id as ticket_id
       FROM tickets t 
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.human_id = 'INC-0001'`);
        (0, vitest_1.expect)(checkMonPost.rows[0].response_breached_at).not.toBeNull();
        (0, vitest_1.expect)(checkMonPost.rows[0].response_breach_reason).toBe('unassigned_too_long');
        // Verify audit event written with actor "system"
        const auditRes = await db.query(`SELECT actor_type, event_type, after
       FROM audit_events
       WHERE ticket_id = $1 AND event_type = 'sla_response_breached'`, [checkMonPost.rows[0].ticket_id]);
        (0, vitest_1.expect)(auditRes.rows.length).toBe(1);
        (0, vitest_1.expect)(auditRes.rows[0].actor_type).toBe('system');
        (0, vitest_1.expect)(auditRes.rows[0].after.reason).toBe('unassigned_too_long');
        // Idempotency check: run scheduler again immediately at Monday 11:01, INC-0001 does not duplicate
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        const auditCountAfter = await db.query(`SELECT count(*) as count FROM audit_events WHERE ticket_id = $1 AND event_type = 'sla_response_breached'`, [checkMonPost.rows[0].ticket_id]);
        (0, vitest_1.expect)(Number(auditCountAfter.rows[0].count)).toBe(1);
    });
    (0, vitest_1.it)('3. Auto-close timing: warning sent at 2160m, auto-closed at 2700m silence', async () => {
        // Create a dedicated waiting ticket starting on Monday 2026-02-23 09:30:00+05:30 (non-holiday week)
        const startIso = '2026-02-23T09:30:00.000+05:30';
        clock.set(startIso, false);
        const custRes = await db.query('SELECT id FROM customers LIMIT 1');
        const customerId = custRes.rows[0].id;
        const tRes = await db.query(`INSERT INTO tickets (human_id, subject, priority, status, customer_id, version, cycle_no, created_at, updated_at)
       VALUES ('INC-TEST-WAIT', 'Waiting Ticket Auto-Close Test', 'medium', 'waiting_on_customer', $1, 1, 1, $2, $2)
       RETURNING id, human_id`, [customerId, startIso]);
        const testTicketId = tRes.rows[0].id;
        // Active pause starting at Monday 09:30
        await db.query(`INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, created_at)
       VALUES ($1, 1, $2, $2)`, [testTicketId, startIso]);
        // 4 business days (Mon, Tue, Wed, Thu) = 2160 business minutes -> Friday 2026-02-27 09:30:00+05:30
        // Jump to Friday 09:35 (2165 minutes elapsed >= 2160 threshold)
        clock.set('2026-02-27T09:35:00.000+05:30', false);
        const pass1 = await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        (0, vitest_1.expect)(pass1.warningsSent).toBeGreaterThanOrEqual(1);
        // Verify warning audit event
        const warningAudit = await db.query(`SELECT * FROM audit_events WHERE ticket_id = $1 AND event_type = 'auto_close_warning_sent'`, [testTicketId]);
        (0, vitest_1.expect)(warningAudit.rows.length).toBe(1);
        // 5 business days = 2700 business minutes -> Friday 2026-02-27 18:30:00+05:30
        // Jump to Friday 18:35 (2705 minutes elapsed >= 2700 threshold)
        clock.set('2026-02-27T18:35:00.000+05:30', false);
        const pass2 = await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        (0, vitest_1.expect)(pass2.autoClosed).toBeGreaterThanOrEqual(1);
        // Verify ticket status closed and pause closed
        const statusCheck = await db.query(`SELECT status FROM tickets WHERE id = $1`, [testTicketId]);
        (0, vitest_1.expect)(statusCheck.rows[0].status).toBe('closed');
        const pauseCheck = await db.query(`SELECT ended_at FROM sla_pauses WHERE ticket_id = $1`, [testTicketId]);
        (0, vitest_1.expect)(pauseCheck.rows[0].ended_at).not.toBeNull();
        // Verify audit event ticket_auto_closed
        const closeAudit = await db.query(`SELECT * FROM audit_events WHERE ticket_id = $1 AND event_type = 'ticket_auto_closed'`, [testTicketId]);
        (0, vitest_1.expect)(closeAudit.rows.length).toBe(1);
    });
    (0, vitest_1.it)('4. Resume-vs-auto-close race: customer replies at 2690m silence, preventing auto-close', async () => {
        // Create another ticket in waiting_on_customer starting at Monday 2026-02-23 09:30:00+05:30
        const startIso = '2026-02-23T09:30:00.000+05:30';
        clock.set(startIso, false);
        const custRes = await db.query('SELECT id, email FROM customers LIMIT 1');
        const customer = custRes.rows[0];
        const tRes = await db.query(`INSERT INTO tickets (human_id, subject, priority, status, customer_id, version, cycle_no, created_at, updated_at)
       VALUES ('INC-TEST-RACE', 'Race condition test', 'medium', 'waiting_on_customer', $1, 1, 1, $2, $2)
       RETURNING id, human_id`, [customer.id, startIso]);
        const testTicketId = tRes.rows[0].id;
        await db.query(`INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, created_at)
       VALUES ($1, 1, $2, $2)`, [testTicketId, startIso]);
        // Jump to Friday 18:20 (2690 business minutes elapsed - 10 minutes before auto-close)
        clock.set('2026-02-27T18:20:00.000+05:30', false);
        // Customer creates magic link & sends public reply
        const token = 'race-test-token-12345';
        const crypto = await import('node:crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await db.query(`INSERT INTO magic_links (token_hash, ticket_id, customer_id, expires_at)
       VALUES ($1, $2, $3, $4)`, [tokenHash, testTicketId, customer.id, '2026-03-15T00:00:00.000Z']);
        const replyRes = await app.inject({
            method: 'POST',
            url: `/api/customer/tickets/${testTicketId}/reply`,
            query: { token },
            payload: {
                body: 'Here are the diagnostic logs you requested earlier.'
            }
        });
        (0, vitest_1.expect)(replyRes.statusCode).toBe(200);
        // Confirm ticket moved to open and pause ended
        const postReply = await db.query(`SELECT status FROM tickets WHERE id = $1`, [testTicketId]);
        (0, vitest_1.expect)(postReply.rows[0].status).toBe('open');
        // Advance clock past auto-close boundary: Friday 18:35 (2705m)
        clock.set('2026-02-27T18:35:00.000+05:30', false);
        // Run scheduler
        await (0, scheduler_service_js_1.runSchedulerPass)(db, clock);
        // Verify ticket is STILL open, NOT auto-closed
        const afterPass = await db.query(`SELECT status FROM tickets WHERE id = $1`, [testTicketId]);
        (0, vitest_1.expect)(afterPass.rows[0].status).toBe('open');
    });
    (0, vitest_1.it)('5. Time Machine API: jumps to named moments, shifts time, sets banner', async () => {
        // 1. Jump to Friday 18:00
        const resJumpFri = await app.inject({
            method: 'POST',
            url: '/api/demo/time/jump',
            payload: { target: 'Friday 18:00' }
        });
        (0, vitest_1.expect)(resJumpFri.statusCode).toBe(200);
        const bodyFri = resJumpFri.json();
        (0, vitest_1.expect)(bodyFri.is_shifted).toBe(true);
        (0, vitest_1.expect)(bodyFri.banner.active).toBe(true);
        (0, vitest_1.expect)(bodyFri.banner.label).toBe('SIMULATED TIME');
        (0, vitest_1.expect)(bodyFri.banner.formatted_time).toContain('Fri, 06 Mar 2026, 18:00:00 IST');
        // 2. Jump to Saturday
        const resJumpSat = await app.inject({
            method: 'POST',
            url: '/api/demo/time/jump',
            payload: { target: 'Saturday' }
        });
        (0, vitest_1.expect)(resJumpSat.statusCode).toBe(200);
        const bodySat = resJumpSat.json();
        (0, vitest_1.expect)(bodySat.banner.formatted_time).toContain('Sat, 07 Mar 2026, 12:00:00 IST');
        // 3. Jump to Monday 11:01
        const resJumpMon = await app.inject({
            method: 'POST',
            url: '/api/demo/time/jump',
            payload: { target: 'Monday 11:01' }
        });
        (0, vitest_1.expect)(resJumpMon.statusCode).toBe(200);
        const bodyMon = resJumpMon.json();
        (0, vitest_1.expect)(bodyMon.banner.formatted_time).toContain('Mon, 09 Mar 2026, 11:01:00 IST');
        // 4. Jump +1 working day
        const resJumpPlus1 = await app.inject({
            method: 'POST',
            url: '/api/demo/time/jump',
            payload: { target: '+1 working day' }
        });
        (0, vitest_1.expect)(resJumpPlus1.statusCode).toBe(200);
        const bodyPlus1 = resJumpPlus1.json();
        // Monday 11:01 + 540m business minutes = Tuesday 11:01
        (0, vitest_1.expect)(bodyPlus1.banner.formatted_time).toContain('Tue, 10 Mar 2026, 11:01:00 IST');
        // 5. Query GET /api/demo/time
        const resGetTime = await app.inject({
            method: 'GET',
            url: '/api/demo/time'
        });
        (0, vitest_1.expect)(resGetTime.statusCode).toBe(200);
        (0, vitest_1.expect)(resGetTime.json().banner.active).toBe(true);
        // 6. Reset clock
        const resReset = await app.inject({
            method: 'POST',
            url: '/api/demo/time/reset'
        });
        (0, vitest_1.expect)(resReset.statusCode).toBe(200);
        (0, vitest_1.expect)(resReset.json().is_shifted).toBe(false);
        (0, vitest_1.expect)(resReset.json().banner.active).toBe(false);
    });
});
//# sourceMappingURL=scheduler-and-seed.test.js.map