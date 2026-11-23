"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addInternalNote = addInternalNote;
exports.getInternalNotesForTicket = getInternalNotesForTicket;
/**
 * INC-0304 Isolated Repository for Internal Notes.
 * Completely segregated from customer data access paths.
 */
async function addInternalNote(db, clock, ticketId, authorId, body) {
    const nowIso = clock.now().toISOString();
    const res = await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body, created_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`, [ticketId, authorId, body, nowIso]);
    return res.rows[0];
}
async function getInternalNotesForTicket(db, ticketId) {
    const res = await db.query(`SELECT n.*, u.name as author_name
     FROM internal_notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.ticket_id = $1
     ORDER BY n.created_at ASC`, [ticketId]);
    return res.rows;
}
//# sourceMappingURL=notes.repository.js.map