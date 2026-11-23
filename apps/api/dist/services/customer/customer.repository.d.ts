import { DatabaseClient } from '../../db/client.js';
import { Clock, Ticket } from '@frontdesk/shared';
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
export declare function getCustomerTicketById(db: DatabaseClient, ticketId: string, customerId?: string): Promise<Ticket | null>;
/**
 * Returns public conversation thread using the customer_visible_events view.
 */
export declare function getCustomerThread(db: DatabaseClient, ticketId: string): Promise<CustomerVisibleEventRow[]>;
export declare function addCustomerMessage(db: DatabaseClient, clock: Clock, ticketId: string, customerId: string, body: string, idempotencyKey?: string): Promise<void>;
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
export declare function reopenOrSpawnLinkedTicket(db: DatabaseClient, clock: Clock, ticketId: string, customerId: string, reason?: string): Promise<ReopenOrSpawnResult>;
