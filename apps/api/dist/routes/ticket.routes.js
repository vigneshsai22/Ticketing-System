"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const ticket_service_js_1 = require("../services/ticket.service.js");
const audit_service_js_1 = require("../services/audit.service.js");
const customer_repository_js_1 = require("../services/customer/customer.repository.js");
const schemas_js_1 = require("../validation/schemas.js");
const ticketRoutes = async (fastify) => {
    // 1. List tickets (protected)
    fastify.get('/tickets', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const query = request.query;
        let sql = `
      SELECT t.*, 
             u.name as assignee_name,
             c.name as customer_name,
             c.email as customer_email,
             tc.response_due,
             tc.resolve_due,
             tc.first_response_at,
             tc.resolved_at
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
      WHERE 1=1
    `;
        const params = [];
        if (query.status) {
            params.push(query.status);
            sql += ` AND t.status = $${params.length}`;
        }
        if (query.priority) {
            params.push(query.priority);
            sql += ` AND t.priority = $${params.length}`;
        }
        if (query.assignee) {
            params.push(query.assignee);
            sql += ` AND t.assignee_id = $${params.length}`;
        }
        sql += ` ORDER BY t.created_at DESC`;
        const res = await db.query(sql, params);
        return reply.send({ tickets: res.rows });
    });
    // 2. Create ticket
    fastify.post('/tickets', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.CreateTicketSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const body = val.data;
        // Default customer if none provided (e.g. from seed)
        let customerId = body.customerId;
        if (!customerId) {
            const custRes = await db.query('SELECT id FROM customers LIMIT 1');
            if (custRes.rows.length === 0) {
                return reply.status(400).send({ error: 'No customers exist to associate with ticket' });
            }
            customerId = custRes.rows[0].id;
        }
        const ticket = await (0, ticket_service_js_1.createTicket)(db, fastify.clock, {
            subject: body.subject,
            priority: body.priority,
            customerId,
            initialMessage: body.initialMessage,
            creatorId: request.user.id,
            creatorType: 'agent'
        });
        return reply.status(201).send({ ticket });
    });
    // 3. Get single ticket with cycle & SLA info
    fastify.get('/tickets/:id', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const res = await db.query(`SELECT t.*, 
              u.name as assignee_name,
              c.name as customer_name,
              c.email as customer_email,
              tc.clock_start,
              tc.response_due,
              tc.resolve_due,
              tc.first_response_at,
              tc.resolved_at,
              tc.response_breached_at,
              tc.resolve_breached_at,
              tc.response_breach_reason,
              tc.resolve_breach_reason
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.id = $1`, [id]);
        if (res.rows.length === 0) {
            return reply.status(404).send({ error: 'Ticket not found' });
        }
        return reply.send({ ticket: res.rows[0] });
    });
    // 3a. Get ticket thread (public messages, internal notes, audit events for agents)
    fastify.get('/tickets/:id/thread', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        // Public messages
        const messagesRes = await db.query(`SELECT pm.*, 
              CASE WHEN pm.sender_type = 'agent' THEN u.name ELSE c.name END as sender_name,
              CASE WHEN pm.sender_type = 'agent' THEN u.email ELSE c.email END as sender_email
       FROM public_messages pm
       LEFT JOIN users u ON pm.sender_type = 'agent' AND u.id = pm.sender_id
       LEFT JOIN customers c ON pm.sender_type = 'customer' AND c.id = pm.sender_id
       WHERE pm.ticket_id = $1
       ORDER BY pm.created_at ASC`, [id]);
        // Internal notes
        const notesRes = await db.query(`SELECT in_note.*, u.name as author_name, u.email as author_email
       FROM internal_notes in_note
       LEFT JOIN users u ON u.id = in_note.author_id
       WHERE in_note.ticket_id = $1
       ORDER BY in_note.created_at ASC`, [id]);
        // Relevant audit events
        const auditRes = await db.query(`SELECT ae.*, ae.seq as global_seq, u.name as actor_name
       FROM audit_events ae
       LEFT JOIN users u ON ae.actor_type = 'agent' AND u.id = ae.actor_id
       WHERE ae.ticket_id = $1
       ORDER BY ae.seq ASC`, [id]);
        // Pauses and active cycle
        const pausesRes = await db.query(`SELECT * FROM sla_pauses WHERE ticket_id = $1 ORDER BY started_at ASC`, [id]);
        const cycleRes = await db.query(`SELECT tc.*, p.respond_minutes, p.resolve_minutes, p.resolve_mode
       FROM ticket_cycles tc
       JOIN tickets t ON t.id = tc.ticket_id
       LEFT JOIN sla_policies p ON p.priority = t.priority
       WHERE tc.ticket_id = $1
       ORDER BY tc.cycle_no DESC LIMIT 1`, [id]);
        return reply.send({
            public_messages: messagesRes.rows,
            internal_notes: notesRes.rows,
            audit_events: auditRes.rows,
            pauses: pausesRes.rows,
            cycle: cycleRes.rows[0] || null
        });
    });
    // 3b. Customer view preview (returns safe public thread via customer_visible_events view)
    fastify.get('/tickets/:id/customer-preview', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const events = await (0, customer_repository_js_1.getCustomerThread)(db, id);
        return reply.send({ events });
    });
    // 4. INC-0291: Atomic ticket claim
    fastify.post('/tickets/:id/claim', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        try {
            const ticket = await (0, ticket_service_js_1.claimTicket)(db, fastify.clock, id, {
                id: request.user.id,
                type: 'agent',
                role: request.user.role,
                name: request.user.name
            });
            return reply.send({ success: true, ticket });
        }
        catch (err) {
            if (err instanceof ticket_service_js_1.TicketClaimError) {
                return reply.status(409).send({
                    error: 'Ticket already claimed',
                    current_assignee: err.currentOwner
                });
            }
            throw err;
        }
    });
    // 5. Release ticket (assignee or lead/admin)
    fastify.post('/tickets/:id/release', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.ReleaseTicketSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const version = val.data?.version;
        try {
            const ticket = await (0, ticket_service_js_1.releaseTicket)(db, fastify.clock, id, {
                id: request.user.id,
                type: 'agent',
                role: request.user.role,
                name: request.user.name
            }, version);
            return reply.send({ success: true, ticket });
        }
        catch (err) {
            if (err instanceof ticket_service_js_1.ForbiddenError) {
                return reply.status(403).send({ error: err.message });
            }
            if (err instanceof ticket_service_js_1.OptimisticLockError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    });
    // 6. Reassign ticket (Lead or Admin only)
    fastify.post('/tickets/:id/reassign', {
        preHandler: [fastify.requireRole('lead', 'admin')]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.ReassignTicketSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const newAssigneeId = val.data.assigneeId || val.data.agentId;
        const { version } = val.data;
        try {
            const ticket = await (0, ticket_service_js_1.reassignTicket)(db, fastify.clock, id, newAssigneeId, {
                id: request.user.id,
                type: 'agent',
                role: request.user.role,
                name: request.user.name
            }, version);
            return reply.send({ success: true, ticket });
        }
        catch (err) {
            if (err instanceof ticket_service_js_1.ForbiddenError) {
                return reply.status(403).send({ error: err.message });
            }
            if (err instanceof ticket_service_js_1.OptimisticLockError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    });
    // 7. Update status via state machine (pause/resume bookkeeping)
    fastify.patch('/tickets/:id/status', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.UpdateStatusSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const { status, version } = val.data;
        try {
            const ticket = await (0, ticket_service_js_1.updateTicketStatus)(db, fastify.clock, id, status, {
                id: request.user.id,
                type: 'agent',
                role: request.user.role,
                name: request.user.name
            }, version);
            return reply.send({ success: true, ticket });
        }
        catch (err) {
            if (err instanceof ticket_service_js_1.StatusTransitionError) {
                return reply.status(400).send({ error: err.message });
            }
            if (err instanceof ticket_service_js_1.OptimisticLockError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    });
    // 8. GET /tickets/:id/audit
    fastify.get('/tickets/:id/audit', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const res = await db.query(`SELECT ae.*, u.name as actor_name 
       FROM audit_events ae
       LEFT JOIN users u ON ae.actor_type = 'agent' AND u.id = ae.actor_id
       WHERE ae.ticket_id = $1 
       ORDER BY ae.seq ASC`, [id]);
        return reply.send({ events: res.rows });
    });
    // 9. GET /tickets/:id/audit/verify (cryptographic audit chain verification)
    fastify.get('/tickets/:id/audit/verify', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const result = await (0, audit_service_js_1.verifyTicketAuditChain)(db, id);
        return reply.send(result);
    });
};
exports.default = ticketRoutes;
//# sourceMappingURL=ticket.routes.js.map