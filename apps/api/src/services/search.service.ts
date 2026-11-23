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
export async function searchPublicTickets(
  db: DatabaseClient,
  query: string
): Promise<SearchResultItem[]> {
  const term = `%${query.trim()}%`;

  const sql = `
    SELECT DISTINCT 
      t.id, t.human_id, t.subject, t.status, t.priority,
      c.name as customer_name, c.email as customer_email,
      CASE 
        WHEN t.human_id ILIKE $1 THEN 'human_id'
        WHEN t.subject ILIKE $1 THEN 'subject'
        WHEN c.name ILIKE $1 OR c.email ILIKE $1 THEN 'customer'
        ELSE 'public_message'
      END as match_source
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN public_messages pm ON pm.ticket_id = t.id
    WHERE t.human_id ILIKE $1
       OR t.subject ILIKE $1
       OR c.name ILIKE $1
       OR c.email ILIKE $1
       OR pm.body ILIKE $1
    ORDER BY t.human_id DESC
    LIMIT 50
  `;

  const res = await db.query<SearchResultItem>(sql, [term]);
  return res.rows;
}

/**
 * Internal-only Search:
 * Separate code path for agents/leads. Also searches internal_notes.
 */
export async function searchInternalTickets(
  db: DatabaseClient,
  query: string
): Promise<SearchResultItem[]> {
  const term = `%${query.trim()}%`;

  const sql = `
    SELECT DISTINCT 
      t.id, t.human_id, t.subject, t.status, t.priority,
      c.name as customer_name, c.email as customer_email,
      CASE 
        WHEN t.human_id ILIKE $1 THEN 'human_id'
        WHEN t.subject ILIKE $1 THEN 'subject'
        WHEN c.name ILIKE $1 OR c.email ILIKE $1 THEN 'customer'
        WHEN n.body ILIKE $1 THEN 'internal_note'
        ELSE 'public_message'
      END as match_source,
      CASE 
        WHEN n.body ILIKE $1 THEN SUBSTRING(n.body FROM 1 FOR 120)
        ELSE NULL
      END as snippet
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN public_messages pm ON pm.ticket_id = t.id
    LEFT JOIN internal_notes n ON n.ticket_id = t.id
    WHERE t.human_id ILIKE $1
       OR t.subject ILIKE $1
       OR c.name ILIKE $1
       OR c.email ILIKE $1
       OR pm.body ILIKE $1
       OR n.body ILIKE $1
    ORDER BY t.human_id DESC
    LIMIT 50
  `;

  const res = await db.query<SearchResultItem>(sql, [term]);
  return res.rows;
}
