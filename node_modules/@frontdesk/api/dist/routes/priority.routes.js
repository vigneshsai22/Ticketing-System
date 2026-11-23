"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const sla_1 = require("@frontdesk/sla");
const sla_sync_service_js_1 = require("../services/sla-sync.service.js");
const audit_service_js_1 = require("../services/audit.service.js");
const sse_service_js_1 = require("../services/sse.service.js");
const ticket_service_js_1 = require("../services/ticket.service.js");
const schemas_js_1 = require("../validation/schemas.js");
const priorityRoutes = async (fastify) => {
    fastify.patch('/tickets/:id/priority', {
        preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.PriorityChangeSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const { priority: newPriority, reason, version: expectedVersion } = val.data;
        const now = fastify.clock.now();
        const nowIso = now.toISOString();
        try {
            // 1. Lock ticket row and check existence / version
            const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
            if (ticketRes.rows.length === 0) {
                return reply.status(404).send({ error: 'Ticket not found' });
            }
            const ticket = ticketRes.rows[0];
            const oldPriority = ticket.priority;
            if (expectedVersion !== undefined && ticket.version !== expectedVersion) {
                throw new ticket_service_js_1.OptimisticLockError();
            }
            // 2. Load and lock cycle row to prevent concurrent scheduler breach detection races
            const cycleRes = await db.query('SELECT * FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = $2 FOR UPDATE', [id, ticket.cycle_no]);
            if (cycleRes.rows.length === 0) {
                return reply.status(500).send({ error: 'Active ticket cycle not found' });
            }
            const cycle = cycleRes.rows[0];
            const pauseRes = await db.query('SELECT started_at, ended_at FROM sla_pauses WHERE ticket_id = $1 AND cycle_no = $2 AND ended_at IS NOT NULL', [id, ticket.cycle_no]);
            const pauses = pauseRes.rows.map(p => ({ startedAt: p.started_at, endedAt: p.ended_at }));
            const slaContext = await (0, sla_sync_service_js_1.loadSlaContext)(db);
            const oldPolicy = slaContext.policies[oldPriority];
            const newPolicy = slaContext.policies[newPriority];
            // 3. Recompute deadlines and detect mid-flight escalation breach
            const recompute = (0, sla_1.recomputeOnPriorityChange)(cycle, oldPolicy, newPolicy, pauses, now, slaContext.workingHours, slaContext.holidays);
            // 4. Update ticket table with optimistic locking
            const updateRes = await db.query(`UPDATE tickets
         SET priority = $1, version = version + 1, updated_at = $2
         WHERE id = $3 AND version = $4
         RETURNING *`, [newPriority, nowIso, id, ticket.version]);
            if (updateRes.rowCount === 0) {
                throw new ticket_service_js_1.OptimisticLockError();
            }
            const updatedTicket = updateRes.rows[0];
            // 5. Update ticket_cycles with recomputed deadlines and breach records
            await db.query(`UPDATE ticket_cycles
         SET response_due = $1,
             resolve_due = $2,
             response_breached_at = COALESCE(response_breached_at, $3),
             response_breach_reason = COALESCE(response_breach_reason, $4),
             resolve_breached_at = COALESCE(resolve_breached_at, $5),
             resolve_breach_reason = COALESCE(resolve_breach_reason, $6),
             updated_at = $7
         WHERE ticket_id = $8 AND cycle_no = $9`, [
                recompute.newResponseDue.toUTC().toISO(),
                recompute.newResolveDue.toUTC().toISO(),
                recompute.responseBreached ? recompute.responseBreachedAt : null,
                recompute.responseBreachReason,
                recompute.resolveBreached ? recompute.resolveBreachedAt : null,
                recompute.resolveBreachReason,
                nowIso,
                id,
                ticket.cycle_no
            ]);
            // 6. Record audit event in the same transaction
            await (0, audit_service_js_1.recordAuditEvent)(db, fastify.clock, {
                ticketId: id,
                actorType: 'agent',
                actorId: request.user.id,
                eventType: 'priority_changed',
                before: { priority: oldPriority },
                after: {
                    priority: newPriority,
                    reason: reason.trim(),
                    escalated_mid_flight: recompute.isEscalatedMidFlight
                }
            });
            // 7. Broadcast SSE update (IDs and metadata only, no notes)
            sse_service_js_1.sseBroadcaster.broadcast('ticket_updated', {
                ticket_id: updatedTicket.id,
                human_id: updatedTicket.human_id,
                priority: updatedTicket.priority,
                status: updatedTicket.status,
                version: updatedTicket.version,
                updated_by: request.user.id
            });
            return reply.send({
                success: true,
                ticket: updatedTicket,
                recompute: {
                    response_due: recompute.newResponseDue.toISO(),
                    resolve_due: recompute.newResolveDue.toISO(),
                    response_breached: recompute.responseBreached,
                    response_breach_reason: recompute.responseBreachReason,
                    is_escalated_mid_flight: recompute.isEscalatedMidFlight
                }
            });
        }
        catch (err) {
            if (err instanceof ticket_service_js_1.OptimisticLockError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    });
};
exports.default = priorityRoutes;
//# sourceMappingURL=priority.routes.js.map