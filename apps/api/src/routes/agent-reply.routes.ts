import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { Ticket, PublicMessage, Customer } from '@frontdesk/shared';
import { addInternalNote } from '../services/notes.repository.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { enqueueOutboxEmail } from '../services/outbox.service.js';
import { sseBroadcaster } from '../services/sse.service.js';
import { toDateTime } from '@frontdesk/sla';
import { AgentReplySchema, InternalNoteSchema, validateWithZod } from '../validation/schemas.js';

const agentReplyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. POST Public Reply (Assignee only; Idempotency-Key required; optional "send and wait on customer")
  fastify.post<{
    Params: { id: string };
    Body: { body: string; wait_on_customer?: boolean };
  }>('/tickets/:id/reply', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(AgentReplySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { id } = request.params;
    const { body, wait_on_customer } = val.data;
    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      return reply.status(400).send({ error: 'Idempotency-Key header is required' });
    }

    // Check ticket existence & assignee authorization
    const ticketRes = await db.query<Ticket>('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];

    const isAssignee = ticket.assignee_id === request.user.id;
    const isLeadOrAdmin = request.user.role === 'lead' || request.user.role === 'admin';

    if (!isAssignee && !isLeadOrAdmin) {
      return reply.status(403).send({ error: 'Only the assigned agent may post a public reply' });
    }

    // Check idempotency deduplication
    const existingMsg = await db.query<PublicMessage>(
      'SELECT * FROM public_messages WHERE ticket_id = $1 AND idempotency_key = $2',
      [id, idempotencyKey]
    );
    if (existingMsg.rows.length > 0) {
      return reply.send({
        success: true,
        message: existingMsg.rows[0],
        duplicate: true
      });
    }

    const now = fastify.clock.now();
    const nowIso = now.toISOString();

    // Insert public message
    const insertRes = await db.query<PublicMessage>(
      `INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, idempotency_key, created_at)
       VALUES ($1, 'agent', $2, $3, $4, $5)
       RETURNING *`,
      [id, request.user.id, body.trim(), idempotencyKey, nowIso]
    );
    const message = insertRes.rows[0];

    // First public reply sets first_response_at on the current cycle
    const cycleRes = await db.query<{ first_response_at: string | null; response_due: string }>(
      'SELECT first_response_at, response_due FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = $2',
      [id, ticket.cycle_no]
    );

    if (cycleRes.rows.length > 0) {
      const cycle = cycleRes.rows[0];
      if (!cycle.first_response_at) {
        const responseDueDt = toDateTime(cycle.response_due);
        const isBreached = now > responseDueDt.toJSDate();

        await db.query(
          `UPDATE ticket_cycles
           SET first_response_at = $1,
               response_breached_at = CASE WHEN $2 = TRUE THEN $1 ELSE response_breached_at END,
               response_breach_reason = CASE WHEN $2 = TRUE THEN 'slow_after_assignment' ELSE response_breach_reason END,
               updated_at = $1
           WHERE ticket_id = $3 AND cycle_no = $4`,
          [nowIso, isBreached, id, ticket.cycle_no]
        );
      }
    }

    // Handle optional "send and wait on customer" -> pauses both clocks
    if (wait_on_customer && ticket.status !== 'waiting_on_customer') {
      await db.query(
        `UPDATE tickets SET status = 'waiting_on_customer', version = version + 1, updated_at = $1 WHERE id = $2`,
        [nowIso, id]
      );

      await db.query(
        `INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, paused_by, reason, created_at)
         VALUES ($1, $2, $3, $4, 'Agent replied with send_and_wait', $3)`,
        [id, ticket.cycle_no, nowIso, request.user.id]
      );

      await recordAuditEvent(db, fastify.clock, {
        ticketId: id,
        actorType: 'agent',
        actorId: request.user.id,
        eventType: 'status_changed',
        before: { status: ticket.status },
        after: { status: 'waiting_on_customer', reason: 'send_and_wait' }
      });
    }

    // Record audit event for public reply
    await recordAuditEvent(db, fastify.clock, {
      ticketId: id,
      actorType: 'agent',
      actorId: request.user.id,
      eventType: 'public_reply_sent',
      before: null,
      after: {
        message_id: message.id,
        wait_on_customer: Boolean(wait_on_customer)
      }
    });

    // Enqueue outbox notification to customer
    const custRes = await db.query<Customer>('SELECT * FROM customers WHERE id = $1', [ticket.customer_id]);
    if (custRes.rows.length > 0) {
      const customer = custRes.rows[0];
      await enqueueOutboxEmail(db, fastify.clock, {
        recipientEmail: customer.email,
        template: 'agent_reply',
        customerName: customer.name,
        ticketHumanId: ticket.human_id,
        ticketSubject: ticket.subject,
        messageBody: body.trim()
      });
    }

    // Broadcast SSE update (IDs and metadata only, never internal note)
    sseBroadcaster.broadcast('new_message', {
      ticket_id: id,
      message_id: message.id,
      sender_type: 'agent',
      sender_id: request.user.id
    });

    return reply.status(201).send({
      success: true,
      message
    });
  });

  // 2. POST Internal Note (Separate table, separate repository; IMMUTABLE)
  fastify.post<{
    Params: { id: string };
    Body: { body: string };
  }>('/tickets/:id/notes', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(InternalNoteSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { id } = request.params;
    const { body } = val.data;

    const ticketRes = await db.query('SELECT id FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    // Isolated repository function (does not touch customer routes or SLA)
    const note = await addInternalNote(db, fastify.clock, id, request.user.id, body.trim());

    // Audit event (note body is not exposed in public views)
    await recordAuditEvent(db, fastify.clock, {
      ticketId: id,
      actorType: 'agent',
      actorId: request.user.id,
      eventType: 'internal_note_added',
      before: null,
      after: { note_id: note.id, author_id: request.user.id }
    });

    return reply.status(201).send({
      success: true,
      note
    });
  });
};

export default agentReplyRoutes;
