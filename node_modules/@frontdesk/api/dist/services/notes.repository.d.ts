import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
export interface InternalNoteRow {
    id: string;
    ticket_id: string;
    author_id: string;
    author_name?: string;
    body: string;
    created_at: string;
}
/**
 * INC-0304 Isolated Repository for Internal Notes.
 * Completely segregated from customer data access paths.
 */
export declare function addInternalNote(db: DatabaseClient, clock: Clock, ticketId: string, authorId: string, body: string): Promise<InternalNoteRow>;
export declare function getInternalNotesForTicket(db: DatabaseClient, ticketId: string): Promise<InternalNoteRow[]>;
