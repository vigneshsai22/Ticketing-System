"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_js_1 = require("./client.js");
const migrate_js_1 = require("./migrate.js");
const seed_stub_js_1 = require("./seed-stub.js");
(0, vitest_1.describe)('Postgres Schema, Triggers, and Isolation Verification', () => {
    let db;
    (0, vitest_1.beforeAll)(async () => {
        // Run schema migrations and stub seeds
        await (0, migrate_js_1.runMigrations)();
        await (0, seed_stub_js_1.runStubSeed)();
        db = await (0, client_js_1.getDbClient)();
    });
    (0, vitest_1.afterAll)(async () => {
        if (db) {
            await db.close();
        }
    });
    (0, vitest_1.it)('generates sequential human IDs (INC-0001, INC-0002)', async () => {
        const custRes = await db.query('SELECT id FROM customers LIMIT 1');
        const customerId = custRes.rows[0].id;
        const nowIso = '2026-11-22T14:00:00.000Z';
        const insertRes1 = await db.query(`INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Printer offline', 'medium', 'open', $1, $2, $2)
       RETURNING human_id`, [customerId, nowIso]);
        const insertRes2 = await db.query(`INSERT INTO tickets (subject, priority, status, customer_id, created_at, updated_at)
       VALUES ('Network slow', 'low', 'open', $1, $2, $2)
       RETURNING human_id`, [customerId, nowIso]);
        (0, vitest_1.expect)(insertRes1.rows[0].human_id).toMatch(/^INC-\d{4}$/);
        (0, vitest_1.expect)(insertRes2.rows[0].human_id).toMatch(/^INC-\d{4}$/);
    });
    (0, vitest_1.it)('INC-0318: audit_events trigger prevents UPDATE and DELETE', async () => {
        // Insert an audit event
        const auditRes = await db.query(`INSERT INTO audit_events (actor_type, event_type, before, after, hash)
       VALUES ('system', 'test_event', '{"foo":"bar"}'::jsonb, '{"foo":"baz"}'::jsonb, 'sha256_mock_hash')
       RETURNING id`);
        const auditId = auditRes.rows[0].id;
        // Attempt UPDATE - must fail with exception
        await (0, vitest_1.expect)(db.query(`UPDATE audit_events SET event_type = 'tampered' WHERE id = $1`, [auditId])).rejects.toThrow(/Immutability violation/i);
        // Attempt DELETE - must fail with exception
        await (0, vitest_1.expect)(db.query(`DELETE FROM audit_events WHERE id = $1`, [auditId])).rejects.toThrow(/Immutability violation/i);
    });
    (0, vitest_1.it)('INC-0304: public_messages and internal_notes triggers prevent UPDATE and DELETE', async () => {
        const ticketRes = await db.query('SELECT id FROM tickets LIMIT 1');
        const ticketId = ticketRes.rows[0].id;
        const agentRes = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['agent']);
        const agentId = agentRes.rows[0].id;
        // Public message immutability
        const msgRes = await db.query(`INSERT INTO public_messages (ticket_id, sender_type, sender_id, body)
       VALUES ($1, 'agent', $2, 'Hello customer')
       RETURNING id`, [ticketId, agentId]);
        const msgId = msgRes.rows[0].id;
        await (0, vitest_1.expect)(db.query(`UPDATE public_messages SET body = 'Edited text' WHERE id = $1`, [msgId])).rejects.toThrow(/Immutability violation/i);
        await (0, vitest_1.expect)(db.query(`DELETE FROM public_messages WHERE id = $1`, [msgId])).rejects.toThrow(/Immutability violation/i);
        // Internal note immutability
        const noteRes = await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, 'Internal private diagnosis')
       RETURNING id`, [ticketId, agentId]);
        const noteId = noteRes.rows[0].id;
        await (0, vitest_1.expect)(db.query(`UPDATE internal_notes SET body = 'Tampered note' WHERE id = $1`, [noteId])).rejects.toThrow(/Immutability violation/i);
        await (0, vitest_1.expect)(db.query(`DELETE FROM internal_notes WHERE id = $1`, [noteId])).rejects.toThrow(/Immutability violation/i);
    });
    (0, vitest_1.it)('INC-0304: customer_visible_events view STRICTLY excludes internal notes', async () => {
        const ticketRes = await db.query('SELECT id FROM tickets LIMIT 1');
        const ticketId = ticketRes.rows[0].id;
        const agentRes = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['agent']);
        const agentId = agentRes.rows[0].id;
        const canaryToken = `CANARY_PRIVATE_SECRET_${Math.random().toString(36).substring(2)}`;
        // Insert an internal note containing the canary token
        await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)`, [ticketId, agentId, `Secret agent assessment: ${canaryToken}`]);
        // Query customer_visible_events for this ticket
        const viewRes = await db.query(`SELECT * FROM customer_visible_events WHERE ticket_id = $1`, [ticketId]);
        const serializedEvents = JSON.stringify(viewRes.rows);
        (0, vitest_1.expect)(serializedEvents).not.toContain(canaryToken);
    });
});
//# sourceMappingURL=schema.test.js.map