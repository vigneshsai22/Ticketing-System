import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
import { renderCustomerEmail } from './customer-serializer.js';

export interface EnqueueEmailParams {
  recipientEmail: string;
  template: 'ticket_created' | 'agent_reply' | 'status_change' | 'auto_close_warning' | 'magic_link';
  customerName: string;
  ticketHumanId?: string;
  ticketSubject?: string;
  messageBody?: string;
  newStatus?: string;
  magicLinkUrl?: string;
}

/**
 * Enqueues a simulated email in the outbox table.
 * All email bodies are constructed strictly via the customer serializer to prevent note leakage.
 */
export async function enqueueOutboxEmail(
  db: DatabaseClient,
  clock: Clock,
  params: EnqueueEmailParams
): Promise<string> {
  const { subject, body } = renderCustomerEmail(params);
  const nowIso = clock.now().toISOString();

  const res = await db.query<{ id: string }>(
    `INSERT INTO outbox (
       recipient_email, subject, body, template, status, created_at
     ) VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING id`,
    [params.recipientEmail, subject, body, params.template, nowIso]
  );

  return res.rows[0].id;
}
