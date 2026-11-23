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
export async function addInternalNote(
  db: DatabaseClient,
  clock: Clock,
  ticketId: string,
  authorId: string,
  body: string
): Promise<InternalNoteRow> {
  const nowIso = clock.now().toISOString();

  const res = await db.query<InternalNoteRow>(
    `INSERT INTO internal_notes (ticket_id, author_id, body, created_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [ticketId, authorId, body, nowIso]
  );

  return res.rows[0];
}

export async function getInternalNotesForTicket(
  db: DatabaseClient,
  ticketId: string
): Promise<InternalNoteRow[]> {
  const res = await db.query<InternalNoteRow>(
    `SELECT n.*, u.name as author_name
     FROM internal_notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.ticket_id = $1
     ORDER BY n.created_at ASC`,
    [ticketId]
  );
  return res.rows;
}
