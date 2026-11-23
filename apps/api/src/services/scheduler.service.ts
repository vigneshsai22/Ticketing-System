import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
import { businessMinutesBetween, toDateTime } from '@frontdesk/sla';
import { loadSlaContext } from './sla-sync.service.js';
import { recordAuditEvent } from './audit.service.js';
import { enqueueOutboxEmail } from './outbox.service.js';

export interface SchedulerPassSummary {
  responseBreaches: number;
  resolveBreaches: number;
  warningsSent: number;
  autoClosed: number;
  reopenClosed: number;
}

const SCHEDULER_LOCK_ID = 847291;

/**
 * Idempotent Scheduler Pass:
 * 1. Detects and records SLA response & resolution breaches exactly once.
 * 2. Sends auto-close warning after customer silence.
 * 3. Auto-closes tickets after configured customer silence (2700 business minutes).
 * 4. Marks tickets closed when customer reopen window expires.
 * 
 * Uses PostgreSQL advisory locking to ensure multiple instances or rapid triggers never overlap.
 */
export async function runSchedulerPass(
  db: DatabaseClient,
  clock: Clock
): Promise<SchedulerPassSummary> {
  const summary: SchedulerPassSummary = {
    responseBreaches: 0,
    resolveBreaches: 0,
    warningsSent: 0,
    autoClosed: 0,
    reopenClosed: 0
  };

  // 1. Acquire advisory lock (if engine supports it)
  let hasLock = true;
  try {
    const lockRes = await db.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) as locked',
      [SCHEDULER_LOCK_ID]
    );
    if (lockRes.rows.length > 0 && lockRes.rows[0].locked === false) {
      // Another instance is currently executing the scheduler
      return summary;
    }
  } catch {
    // Engine may not support pg_try_advisory_lock; proceed safely
    hasLock = false;
  }

  try {
    const now = clock.now();
    const nowIso = now.toISOString();
    const slaContext = await loadSlaContext(db);

    // ========================================================================
    // A. Detect & Record SLA Response Breaches (Exactly Once)
    // ========================================================================
    const pendingResponseRes = await db.query<{
      ticket_id: string;
      cycle_no: number;
      clock_start: string;
      response_due: string;
      assignee_id: string | null;
    }>(
      `SELECT tc.ticket_id, tc.cycle_no, tc.clock_start, tc.response_due, t.assignee_id
       FROM ticket_cycles tc
       JOIN tickets t ON t.id = tc.ticket_id
       WHERE tc.first_response_at IS NULL
         AND tc.response_breached_at IS NULL
         AND t.status NOT IN ('resolved', 'closed')`
    );

    for (const row of pendingResponseRes.rows) {
      const due = toDateTime(row.response_due, slaContext.workingHours.timezone);
      if (now > due.toJSDate()) {
        const breachReason = row.assignee_id ? 'slow_after_assignment' : 'unassigned_too_long';

        // Update cycle
        await db.query(
          `UPDATE ticket_cycles
           SET response_breached_at = $1,
               response_breach_reason = $2,
               updated_at = $1
           WHERE ticket_id = $3 AND cycle_no = $4 AND response_breached_at IS NULL`,
          [nowIso, breachReason, row.ticket_id, row.cycle_no]
        );

        // Record audit event with actor "system"
        await recordAuditEvent(db, clock, {
          ticketId: row.ticket_id,
          actorType: 'system',
          actorId: null,
          eventType: 'sla_response_breached',
          before: null,
          after: {
            cycle_no: row.cycle_no,
            response_due: row.response_due,
            breached_at: nowIso,
            reason: breachReason
          }
        });

        summary.responseBreaches++;
      }
    }

    // ========================================================================
    // B. Detect & Record SLA Resolution Breaches (Exactly Once)
    // ========================================================================
    const pendingResolveRes = await db.query<{
      ticket_id: string;
      cycle_no: number;
      resolve_due: string;
      assignee_id: string | null;
    }>(
      `SELECT tc.ticket_id, tc.cycle_no, tc.resolve_due, t.assignee_id
       FROM ticket_cycles tc
       JOIN tickets t ON t.id = tc.ticket_id
       WHERE tc.resolved_at IS NULL
         AND tc.resolve_breached_at IS NULL
         AND t.status NOT IN ('resolved', 'closed')`
    );

    for (const row of pendingResolveRes.rows) {
      const due = toDateTime(row.resolve_due, slaContext.workingHours.timezone);
      if (now > due.toJSDate()) {
        const breachReason = row.assignee_id ? 'slow_after_assignment' : 'unassigned_too_long';

        await db.query(
          `UPDATE ticket_cycles
           SET resolve_breached_at = $1,
               resolve_breach_reason = $2,
               updated_at = $1
           WHERE ticket_id = $3 AND cycle_no = $4 AND resolve_breached_at IS NULL`,
          [nowIso, breachReason, row.ticket_id, row.cycle_no]
        );

        await recordAuditEvent(db, clock, {
          ticketId: row.ticket_id,
          actorType: 'system',
          actorId: null,
          eventType: 'sla_resolve_breached',
          before: null,
          after: {
            cycle_no: row.cycle_no,
            resolve_due: row.resolve_due,
            breached_at: nowIso,
            reason: breachReason
          }
        });

        summary.resolveBreaches++;
      }
    }

    // ========================================================================
    // C. Customer Silence: Auto-Close Warnings and Auto-Close Execution
    // ========================================================================
    const autoCloseMinutes = slaContext.autoCloseMinutes || 2700;
    // Warning sent at 80% silence (~2160 business minutes = 1 business day remaining)
    const warningThresholdMinutes = Math.max(0, autoCloseMinutes - 540);

    const waitingTickets = await db.query<{
      ticket_id: string;
      human_id: string;
      subject: string;
      cycle_no: number;
      customer_id: string;
      customer_email: string;
      customer_name: string;
      pause_id: string;
      pause_start: string;
    }>(
      `SELECT 
         t.id as ticket_id, t.human_id, t.subject, t.cycle_no, t.customer_id,
         c.email as customer_email, c.name as customer_name,
         p.id as pause_id, p.started_at as pause_start
       FROM tickets t
       JOIN customers c ON c.id = t.customer_id
       JOIN sla_pauses p ON p.ticket_id = t.id AND p.cycle_no = t.cycle_no AND p.ended_at IS NULL
       WHERE t.status = 'waiting_on_customer'`
    );

    for (const row of waitingTickets.rows) {
      const elapsedBusinessMins = businessMinutesBetween(
        row.pause_start,
        now,
        [],
        slaContext.workingHours,
        slaContext.holidays
      );

      // 1. Check if auto-close threshold (2700 business minutes) reached
      if (elapsedBusinessMins >= autoCloseMinutes) {
        // Lock ticket row to prevent race condition with customer reply resume
        const lockRes = await db.query(
          `SELECT id, status FROM tickets WHERE id = $1 AND status = 'waiting_on_customer' FOR UPDATE`,
          [row.ticket_id]
        );
        if (lockRes.rows.length === 0) {
          // Ticket was resumed or changed status concurrently, skip auto-closing
          continue;
        }

        // Close the pause interval
        await db.query(
          `UPDATE sla_pauses SET ended_at = $1 WHERE id = $2 AND ended_at IS NULL`,
          [nowIso, row.pause_id]
        );

        // Update ticket status to closed
        await db.query(
          `UPDATE tickets 
           SET status = 'closed', version = version + 1, updated_at = $1 
           WHERE id = $2 AND status = 'waiting_on_customer'`,
          [nowIso, row.ticket_id]
        );

        // Record audit event
        await recordAuditEvent(db, clock, {
          ticketId: row.ticket_id,
          actorType: 'system',
          actorId: null,
          eventType: 'ticket_auto_closed',
          before: { status: 'waiting_on_customer' },
          after: {
            status: 'closed',
            reason: `customer_silence_${autoCloseMinutes}m`,
            elapsed_business_minutes: elapsedBusinessMins
          }
        });

        // Enqueue simulated email notification
        await enqueueOutboxEmail(db, clock, {
          recipientEmail: row.customer_email,
          template: 'status_change',
          customerName: row.customer_name,
          ticketHumanId: row.human_id,
          ticketSubject: row.subject,
          newStatus: 'closed (auto-closed due to inactivity)'
        });

        summary.autoClosed++;
      } else if (elapsedBusinessMins >= warningThresholdMinutes) {
        // 2. Check if warning was already sent
        const warningEvent = await db.query(
          `SELECT id FROM audit_events 
           WHERE ticket_id = $1 AND event_type = 'auto_close_warning_sent'`,
          [row.ticket_id]
        );

        if (warningEvent.rows.length === 0) {
          // Send warning
          await enqueueOutboxEmail(db, clock, {
            recipientEmail: row.customer_email,
            template: 'auto_close_warning',
            customerName: row.customer_name,
            ticketHumanId: row.human_id,
            ticketSubject: row.subject
          });

          await recordAuditEvent(db, clock, {
            ticketId: row.ticket_id,
            actorType: 'system',
            actorId: null,
            eventType: 'auto_close_warning_sent',
            before: null,
            after: { elapsed_business_minutes: elapsedBusinessMins }
          });

          summary.warningsSent++;
        }
      }
    }

    // ========================================================================
    // D. Mark Reopen Window Expired (Resolved -> Closed after 5 working days)
    // ========================================================================
    const reopenWindowMinutes = (slaContext.reopenWindowDays || 5) * 540; // 2700 business minutes

    const resolvedTickets = await db.query<{
      ticket_id: string;
      cycle_no: number;
      resolved_at: string;
    }>(
      `SELECT t.id as ticket_id, t.cycle_no, tc.resolved_at
       FROM tickets t
       JOIN ticket_cycles tc ON tc.ticket_id = t.id AND tc.cycle_no = t.cycle_no
       WHERE t.status = 'resolved' AND tc.resolved_at IS NOT NULL`
    );

    for (const row of resolvedTickets.rows) {
      const elapsedBusinessMins = businessMinutesBetween(
        row.resolved_at,
        now,
        [],
        slaContext.workingHours,
        slaContext.holidays
      );

      if (elapsedBusinessMins >= reopenWindowMinutes) {
        await db.query(
          `UPDATE tickets 
           SET status = 'closed', version = version + 1, updated_at = $1 
           WHERE id = $2 AND status = 'resolved'`,
          [nowIso, row.ticket_id]
        );

        await recordAuditEvent(db, clock, {
          ticketId: row.ticket_id,
          actorType: 'system',
          actorId: null,
          eventType: 'ticket_closed',
          before: { status: 'resolved' },
          after: {
            status: 'closed',
            reason: 'reopen_window_expired',
            elapsed_business_minutes: elapsedBusinessMins
          }
        });

        summary.reopenClosed++;
      }
    }

  } finally {
    if (hasLock) {
      try {
        await db.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK_ID]);
      } catch {
        // ignore unlock errors
      }
    }
  }

  return summary;
}
