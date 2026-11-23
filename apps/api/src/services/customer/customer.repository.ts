import { DatabaseClient } from '../../db/client.js';
import { Clock, Ticket, TicketPriority } from '@frontdesk/shared';
import { computeDeadlines, businessMinutesBetween } from '@frontdesk/sla';
import { loadSlaContext } from '../sla-sync.service.js';
import { recordAuditEvent } from '../audit.service.js';
import { createTicket } from '../ticket.service.js';

export interface CustomerVisibleEventRow {
  event_id: string;
  ticket_id: string;
  event_type: string;
  sender_type: string;
  sender_id: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * INC-0304 Dedicated Customer Data Access Repository:
 * Explicit column whitelisting, queries only public tables and the customer_visible_events view.
 * The internal_notes table is strictly prohibited from being referenced here.
 */

export async function getCustomerTicketById(
  db: DatabaseClient,
  ticketId: string,
  customerId?: string
): Promise<Ticket | null> {
  let sql = `
    SELECT 
      id, human_id, subject, priority, status, version, cycle_no, parent_ticket_id, customer_id, created_at, updated_at
    FROM tickets
    WHERE id = $1
  `;
  const params: unknown[] = [ticketId];

  if (customerId) {
    sql += ` AND customer_id = $2`;
    params.push(customerId);
  }

  const res = await db.query<Ticket>(sql, params);
  return res.rows[0] || null;
}

/**
 * Returns public conversation thread using the customer_visible_events view.
 */
export async function getCustomerThread(
  db: DatabaseClient,
  ticketId: string
): Promise<CustomerVisibleEventRow[]> {
  const res = await db.query<CustomerVisibleEventRow>(
    `SELECT event_id, ticket_id, event_type, sender_type, sender_id, content, metadata, created_at
     FROM customer_visible_events
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [ticketId]
  );
  return res.rows;
}

export async function addCustomerMessage(
  db: DatabaseClient,
  clock: Clock,
  ticketId: string,
  customerId: string,
  body: string,
  idempotencyKey?: string
): Promise<void> {
  const now = clock.now();
  const nowIso = now.toISOString();

  // Deduplication check if idempotencyKey supplied
  if (idempotencyKey) {
    const existing = await db.query(
      `SELECT id FROM public_messages WHERE ticket_id = $1 AND idempotency_key = $2`,
      [ticketId, idempotencyKey]
    );
    if (existing.rows.length > 0) {
      return; // Already recorded, idempotent no-op
    }
  }

  // 1. Insert into public_messages
  await db.query(
    `INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, idempotency_key, created_at)
     VALUES ($1, 'customer', $2, $3, $4, $5)`,
    [ticketId, customerId, body, idempotencyKey || null, nowIso]
  );

  // 2. Load ticket with row-level lock (FOR UPDATE) to prevent race conditions with background auto-close
  const ticketRes = await db.query<Ticket>('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
  if (ticketRes.rows.length === 0) return;
  const ticket = ticketRes.rows[0];

  // 3. Resume clock if in waiting_on_customer
  if (ticket.status === 'waiting_on_customer') {
    // Close active pause
    await db.query(
      `UPDATE sla_pauses
       SET ended_at = $1
       WHERE ticket_id = $2 AND cycle_no = $3 AND ended_at IS NULL`,
      [nowIso, ticketId, ticket.cycle_no]
    );

    // Recalculate cycle deadlines with all closed pauses
    const pausesRes = await db.query<{ started_at: string; ended_at: string }>(
      `SELECT started_at, ended_at FROM sla_pauses
       WHERE ticket_id = $1 AND cycle_no = $2 AND ended_at IS NOT NULL`,
      [ticketId, ticket.cycle_no]
    );
    const pauses = pausesRes.rows.map(p => ({ startedAt: p.started_at, endedAt: p.ended_at }));

    const slaContext = await loadSlaContext(db);
    const policy = slaContext.policies[ticket.priority];

    const cycleRes = await db.query<{ clock_start: string }>(
      `SELECT clock_start FROM ticket_cycles WHERE ticket_id = $1 AND cycle_no = $2`,
      [ticketId, ticket.cycle_no]
    );

    if (cycleRes.rows.length > 0) {
      const newDeadlines = computeDeadlines(
        { clock_start: cycleRes.rows[0].clock_start },
        policy,
        pauses,
        slaContext.workingHours,
        slaContext.holidays
      );

      await db.query(
        `UPDATE ticket_cycles
         SET response_due = $1, resolve_due = $2, updated_at = $3
         WHERE ticket_id = $4 AND cycle_no = $5`,
        [
          newDeadlines.responseDue.toUTC().toISO(),
          newDeadlines.resolveDue.toUTC().toISO(),
          nowIso,
          ticketId,
          ticket.cycle_no
        ]
      );
    }

    // Move status back to open / in_progress
    const resumeStatus = ticket.assignee_id ? 'in_progress' : 'open';
    await db.query(
      `UPDATE tickets
       SET status = $1, version = version + 1, updated_at = $2
       WHERE id = $3`,
      [resumeStatus, nowIso, ticketId]
    );

    await recordAuditEvent(db, clock, {
      ticketId,
      actorType: 'customer',
      actorId: customerId,
      eventType: 'status_changed',
      before: { status: 'waiting_on_customer' },
      after: { status: resumeStatus, trigger: 'customer_reply' }
    });
  }

  // 4. Record audit event
  await recordAuditEvent(db, clock, {
    ticketId,
    actorType: 'customer',
    actorId: customerId,
    eventType: 'customer_reply_received',
    before: null,
    after: { body_length: body.length }
  });
}

export interface ReopenOrSpawnResult {
  reopened: boolean;
  newTicketCreated: boolean;
  ticket: Ticket;
}

/**
 * Customer reopen logic:
 * - Allowed within 5 working days (2700 business minutes) of resolution -> starts fresh cycle.
 * - Otherwise (or if ticket was auto-closed) -> creates a new ticket linked via parent_ticket_id.
 */
export async function reopenOrSpawnLinkedTicket(
  db: DatabaseClient,
  clock: Clock,
  ticketId: string,
  customerId: string,
  reason?: string
): Promise<ReopenOrSpawnResult> {
  const now = clock.now();
  const nowIso = now.toISOString();

  const ticketRes = await db.query<Ticket>('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  if (ticketRes.rows.length === 0) {
    throw new Error('Ticket not found');
  }
  const ticket = ticketRes.rows[0];

  // Load latest cycle to check resolved_at
  const cycleRes = await db.query<{ resolved_at: string | null; clock_start: string }>(
    `SELECT resolved_at, clock_start FROM ticket_cycles 
     WHERE ticket_id = $1 AND cycle_no = $2`,
    [ticketId, ticket.cycle_no]
  );
  const cycle = cycleRes.rows[0];

  const slaContext = await loadSlaContext(db);
  const reopenWindowMinutes = slaContext.reopenWindowDays * 9 * 60; // 5 days * 9h * 60m = 2700 mins

  let canReopen = false;
  if (ticket.status === 'resolved' && cycle?.resolved_at) {
    const elapsedBusinessMinutes = businessMinutesBetween(
      cycle.resolved_at,
      now,
      [],
      slaContext.workingHours,
      slaContext.holidays
    );
    if (elapsedBusinessMinutes <= reopenWindowMinutes) {
      canReopen = true;
    }
  }

  if (canReopen) {
    // 1. Reopen existing ticket with new cycle & fresh clocks
    const newCycleNo = ticket.cycle_no + 1;
    const policy = slaContext.policies[ticket.priority];

    const freshDeadlines = computeDeadlines(
      { clock_start: nowIso },
      policy,
      [],
      slaContext.workingHours,
      slaContext.holidays
    );

    // Insert new cycle
    await db.query(
      `INSERT INTO ticket_cycles (
         ticket_id, cycle_no, clock_start, response_due, resolve_due, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        ticket.id,
        newCycleNo,
        freshDeadlines.clockStartNormalized.toUTC().toISO(),
        freshDeadlines.responseDue.toUTC().toISO(),
        freshDeadlines.resolveDue.toUTC().toISO(),
        nowIso
      ]
    );

    // Update ticket status
    const updateRes = await db.query<Ticket>(
      `UPDATE tickets
       SET status = 'reopened', cycle_no = $1, version = version + 1, updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [newCycleNo, nowIso, ticketId]
    );
    const updatedTicket = updateRes.rows[0];

    // Audit event
    await recordAuditEvent(db, clock, {
      ticketId,
      actorType: 'customer',
      actorId: customerId,
      eventType: 'ticket_reopened',
      before: { status: ticket.status, cycle_no: ticket.cycle_no },
      after: { status: 'reopened', cycle_no: newCycleNo, reason }
    });

    return {
      reopened: true,
      newTicketCreated: false,
      ticket: updatedTicket
    };
  } else {
    // 2. Reopen window expired or auto-closed -> create NEW ticket linked via parent_ticket_id
    const newTicket = await createTicket(db, clock, {
      subject: `Follow-up: ${ticket.subject}`,
      priority: ticket.priority as TicketPriority,
      customerId,
      initialMessage: reason || `Follow-up on previously resolved ticket ${ticket.human_id}`,
      creatorId: customerId,
      creatorType: 'customer'
    });

    // Link parent ticket
    await db.query(
      `UPDATE tickets SET parent_ticket_id = $1 WHERE id = $2`,
      [ticket.id, newTicket.id]
    );
    newTicket.parent_ticket_id = ticket.id;

    return {
      reopened: false,
      newTicketCreated: true,
      ticket: newTicket
    };
  }
}
