import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
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
export declare function enqueueOutboxEmail(db: DatabaseClient, clock: Clock, params: EnqueueEmailParams): Promise<string>;
