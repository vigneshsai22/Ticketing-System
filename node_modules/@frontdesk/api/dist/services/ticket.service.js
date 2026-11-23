"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = exports.TicketClaimError = exports.OptimisticLockError = exports.StatusTransitionError = void 0;
exports.assertLegalStatusTransition = assertLegalStatusTransition;
exports.createTicket = createTicket;
exports.claimTicket = claimTicket;
exports.releaseTicket = releaseTicket;
exports.reassignTicket = reassignTicket;
exports.updateTicketStatus = updateTicketStatus;
const sla_1 = require("@frontdesk/sla");
const audit_service_js_1 = require("./audit.service.js");
const sla_sync_service_js_1 = require("./sla-sync.service.js");
class StatusTransitionError extends Error {
    fromStatus;
    toStatus;
    statusCode = 400;
    constructor(fromStatus, toStatus) {
        super(`Illegal status transition from '${fromStatus}' to '${toStatus}'.`);
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.name = 'StatusTransitionError';
    }
}
exports.StatusTransitionError = StatusTransitionError;
class OptimisticLockError extends Error {
    statusCode = 409;
    constructor(message = 'Optimistic lock conflict: ticket has been updated by another process.') {
        super(message);
        this.name = 'OptimisticLockError';
    }
}
exports.OptimisticLockError = OptimisticLockError;
class TicketClaimError extends Error {
    currentOwner;
    statusCode = 409;
    constructor(currentOwner) {
        super(`Ticket already claimed by ${currentOwner}`);
        this.currentOwner = currentOwner;
        this.name = 'TicketClaimError';
    }
}
exports.TicketClaimError = TicketClaimError;
class ForbiddenError extends Error {
    statusCode = 403;
    constructor(message) {
        super(message);
        this.name = 'ForbiddenError';
    }
}
exports.ForbiddenError = ForbiddenError;
const LEGAL_STATUS_TRANSITIONS = {
    new: ['open', 'in_progress'],
    open: ['in_progress', 'waiting_on_customer', 'resolved'],
    in_progress: ['open', 'waiting_on_customer', 'resolved'],
    waiting_on_customer: ['open', 'in_progress', 'closed'],
    resolved: ['closed', 'reopened'],
    reopened: ['open', 'in_progress', 'waiting_on_customer', 'resolved'],
    closed: [] // Terminal state
};
function assertLegalStatusTransition(from, to) {
    const allowed = LEGAL_STATUS_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        throw new StatusTransitionError(from, to);
    }
}
async function createTicket(db, clock, input) {
    const now = clock.now();
    const nowIso = now.toISOString();
    // 1. Insert ticket
    const ticketRes = await db.query(`INSERT INTO tickets (
       subject, priority, status, customer_id, created_at, updated_at
     ) VALUES ($1, $2, 'new', $3, $4, $4)
     RETURNING *`, [input.subject, input.priority, input.customerId, nowIso]);
    const ticket = ticketRes.rows[0];
    // 2. Compute initial SLA deadlines from DB policies & holidays
    const slaContext = await (0, sla_sync_service_js_1.loadSlaContext)(db);
    const policy = slaContext.policies[input.priority];
    const deadlines = (0, sla_1.computeDeadlines)({ clock_start: nowIso }, policy, [], slaContext.workingHours, slaContext.holidays);
    // 3. Insert initial cycle (cycle_no = 1)
    await db.query(`INSERT INTO ticket_cycles (
       ticket_id, cycle_no, clock_start, response_due, resolve_due, created_at, updated_at
     ) VALUES ($1, 1, $2, $3, $4, $5, $5)`, [
        ticket.id,
        deadlines.clockStartNormalized.toUTC().toISO(),
        deadlines.responseDue.toUTC().toISO(),
        deadlines.resolveDue.toUTC().toISO(),
        nowIso
    ]);
    // 4. Record audit event
    await (0, audit_service_js_1.recordAuditEvent)(db, clock, {
        ticketId: ticket.id,
        actorType: input.creatorType || 'customer',
        actorId: input.creatorId || input.customerId,
        eventType: 'ticket_created',
        before: null,
        after: {
            id: ticket.id,
            human_id: ticket.human_id,
            subject: ticket.subject,
            priority: ticket.priority,
            status: ticket.status,
            customer_id: ticket.customer_id
        }
    });
    return ticket;
}
/**
 * INC-0291: Atomic ticket claim.
 * Executes a single atomic UPDATE ... WHERE assignee_id IS NULL RETURNING *.
 * The loser receives an HTTP 409 with the current owner's name.
 */
async function claimTicket(db, clock, ticketId, agent) {
    const nowIso = clock.now().toISOString();
    // Atomic update: only succeeds if assignee_id is currently NULL
    const updateRes = await db.query(`UPDATE tickets
     SET assignee_id = $1, version = version + 1, updated_at = $2
     WHERE id = $3 AND assignee_id IS NULL
     RETURNING *`, [agent.id, nowIso, ticketId]);
    if (updateRes.rowCount === 0) {
        // Ticket was already claimed or does not exist
        const ownerRes = await db.query(`SELECT t.assignee_id, u.name as owner_name 
       FROM tickets t 
       LEFT JOIN users u ON u.id = t.assignee_id 
       WHERE t.id = $1`, [ticketId]);
        if (ownerRes.rows.length === 0) {
            throw new Error(`Ticket ${ticketId} not found`);
        }
        const currentOwner = ownerRes.rows[0].owner_name || 'Another agent';
        throw new TicketClaimError(currentOwner);
    }
    const updatedTicket = updateRes.rows[0];
    // Record audit event in the same transaction/operation
    await (0, audit_service_js_1.recordAuditEvent)(db, clock, {
        ticketId,
        actorType: 'agent',
        actorId: agent.id,
        eventType: 'ticket_claimed',
        before: { assignee_id: null },
        after: { assignee_id: agent.id }
    });
    return updatedTicket;
}
/**
 * Release ticket assignment (assignee or lead/admin).
 */
async function releaseTicket(db, clock, ticketId, actor, expectedVersion) {
    const nowIso = clock.now().toISOString();
    // Load ticket
    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRes.rows.length === 0) {
        throw new Error(`Ticket ${ticketId} not found`);
    }
    const ticket = ticketRes.rows[0];
    // Authorization: must be current assignee or lead/admin
    const isAssignee = ticket.assignee_id === actor.id;
    const isLeadOrAdmin = actor.role === 'lead' || actor.role === 'admin';
    if (!isAssignee && !isLeadOrAdmin) {
        throw new ForbiddenError('Only the current assignee or a lead/admin may release this ticket.');
    }
    let sql = `UPDATE tickets SET assignee_id = NULL, version = version + 1, updated_at = $1 WHERE id = $2`;
    const params = [nowIso, ticketId];
    if (expectedVersion !== undefined) {
        sql += ` AND version = $3`;
        params.push(expectedVersion);
    }
    sql += ` RETURNING *`;
    const updateRes = await db.query(sql, params);
    if (updateRes.rowCount === 0) {
        throw new OptimisticLockError();
    }
    const updated = updateRes.rows[0];
    await (0, audit_service_js_1.recordAuditEvent)(db, clock, {
        ticketId,
        actorType: 'agent',
        actorId: actor.id,
        eventType: 'ticket_released',
        before: { assignee_id: ticket.assignee_id },
        after: { assignee_id: null }
    });
    return updated;
}
/**
 * Reassign ticket to another agent (Lead or Admin only).
 */
async function reassignTicket(db, clock, ticketId, newAssigneeId, actor, expectedVersion) {
    const nowIso = clock.now().toISOString();
    // Role guard: Lead or admin only
    if (actor.role !== 'lead' && actor.role !== 'admin') {
        throw new ForbiddenError('Only leads and admins may reassign tickets.');
    }
    // Load current ticket with lock to prevent race conditions against concurrent claims
    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    if (ticketRes.rows.length === 0) {
        throw new Error(`Ticket ${ticketId} not found`);
    }
    const ticket = ticketRes.rows[0];
    let sql = `UPDATE tickets SET assignee_id = $1, version = version + 1, updated_at = $2 WHERE id = $3`;
    const params = [newAssigneeId, nowIso, ticketId];
    if (expectedVersion !== undefined) {
        sql += ` AND version = $4`;
        params.push(expectedVersion);
    }
    sql += ` RETURNING *`;
    const updateRes = await db.query(sql, params);
    if (updateRes.rowCount === 0) {
        throw new OptimisticLockError();
    }
    const updated = updateRes.rows[0];
    await (0, audit_service_js_1.recordAuditEvent)(db, clock, {
        ticketId,
        actorType: 'agent',
        actorId: actor.id,
        eventType: 'ticket_reassigned',
        before: { assignee_id: ticket.assignee_id },
        after: { assignee_id: newAssigneeId }
    });
    return updated;
}
/**
 * Transitions ticket status through the validated state machine,
 * with automatic SLA pause and resume bookkeeping.
 */
async function updateTicketStatus(db, clock, ticketId, newStatus, actor, expectedVersion) {
    const now = clock.now();
    const nowIso = now.toISOString();
    // 1. Load current ticket
    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRes.rows.length === 0) {
        throw new Error(`Ticket ${ticketId} not found`);
    }
    const ticket = ticketRes.rows[0];
    const oldStatus = ticket.status;
    // 2. Validate state machine transition
    assertLegalStatusTransition(oldStatus, newStatus);
    // 3. Optimistic lock update
    let sql = `UPDATE tickets SET status = $1, version = version + 1, updated_at = $2 WHERE id = $3`;
    const params = [newStatus, nowIso, ticketId];
    if (expectedVersion !== undefined) {
        sql += ` AND version = $4`;
        params.push(expectedVersion);
    }
    sql += ` RETURNING *`;
    const updateRes = await db.query(sql, params);
    if (updateRes.rowCount === 0) {
        throw new OptimisticLockError();
    }
    const updatedTicket = updateRes.rows[0];
    // 4. Pause / Resume bookkeeping
    if (newStatus === 'waiting_on_customer') {
        // Entering pause state
        await db.query(`INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, paused_by, reason)
       VALUES ($1, $2, $3, $4, 'Status set to waiting_on_customer')`, [ticketId, ticket.cycle_no, nowIso, actor.id]);
    }
    else if (oldStatus === 'waiting_on_customer') {
        // Exiting pause state: close active pause
        await db.query(`UPDATE sla_pauses 
       SET ended_at = $1 
       WHERE ticket_id = $2 AND cycle_no = $3 AND ended_at IS NULL`, [nowIso, ticketId, ticket.cycle_no]);
        // Recompute deadlines for this cycle with all accumulated pauses
        const pausesRes = await db.query(`SELECT started_at, ended_at FROM sla_pauses 
       WHERE ticket_id = $1 AND cycle_no = $2 AND ended_at IS NOT NULL`, [ticketId, ticket.cycle_no]);
        const pauses = pausesRes.rows.map(p => ({
            startedAt: p.started_at,
            endedAt: p.ended_at
        }));
        const slaContext = await (0, sla_sync_service_js_1.loadSlaContext)(db);
        const policy = slaContext.policies[ticket.priority];
        const cycleRes = await db.query(`SELECT clock_start FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = $2`, [ticketId, ticket.cycle_no]);
        if (cycleRes.rows.length > 0) {
            const newDeadlines = (0, sla_1.computeDeadlines)({ clock_start: cycleRes.rows[0].clock_start }, policy, pauses, slaContext.workingHours, slaContext.holidays);
            await db.query(`UPDATE ticket_cycles 
         SET response_due = $1, resolve_due = $2, updated_at = $3
         WHERE ticket_id = $4 AND cycle_no = $5`, [
                newDeadlines.responseDue.toUTC().toISO(),
                newDeadlines.resolveDue.toUTC().toISO(),
                nowIso,
                ticketId,
                ticket.cycle_no
            ]);
        }
    }
    // 5. If transitioning to resolved, record resolved_at in cycle
    if (newStatus === 'resolved') {
        await db.query(`UPDATE ticket_cycles 
       SET resolved_at = $1, updated_at = $1
       WHERE ticket_id = $2 AND cycle_no = $3 AND resolved_at IS NULL`, [nowIso, ticketId, ticket.cycle_no]);
    }
    // 6. Record audit event
    await (0, audit_service_js_1.recordAuditEvent)(db, clock, {
        ticketId,
        actorType: actor.type,
        actorId: actor.id,
        eventType: 'status_changed',
        before: { status: oldStatus },
        after: { status: newStatus }
    });
    return updatedTicket;
}
//# sourceMappingURL=ticket.service.js.map