import { DatabaseClient } from '../db/client.js';
export interface SearchResultItem {
    id: string;
    human_id: string;
    subject: string;
    status: string;
    priority: string;
    customer_name: string;
    customer_email: string;
    match_source: 'subject' | 'human_id' | 'customer' | 'public_message' | 'internal_note';
    snippet?: string;
}
/**
 * Public Agent Search:
 * Searches tickets by human_id, subject, customer info, and public_messages.
 * INC-0304: Does NOT touch or query the internal_notes table.
 */
export declare function searchPublicTickets(db: DatabaseClient, query: string): Promise<SearchResultItem[]>;
/**
 * Internal-only Search:
 * Separate code path for agents/leads. Also searches internal_notes.
 */
export declare function searchInternalTickets(db: DatabaseClient, query: string): Promise<SearchResultItem[]>;
