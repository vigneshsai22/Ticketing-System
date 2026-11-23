import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { Ticket, Customer } from '@frontdesk/shared';
import { getCustomerThread } from '../services/customer/customer.repository.js';
import { getInternalNotesForTicket } from '../services/notes.repository.js';

const exportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Customer transcript export (Public only; safe for sharing with customer)
  fastify.get<{ Params: { id: string } }>('/tickets/:id/export/customer', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { id } = request.params;

    const ticketRes = await db.query<Ticket>('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];

    const custRes = await db.query<Customer>('SELECT * FROM customers WHERE id = $1', [ticket.customer_id]);
    const customer = custRes.rows[0];

    // Uses customer_visible_events view: structurally guarantees 0 internal note exposure
    const events = await getCustomerThread(db, id);

    const transcriptLines = [
      `================================================================================`,
      `ARVO SYSTEMS - CUSTOMER SUPPORT TRANSCRIPT`,
      `================================================================================`,
      `Ticket ID:    ${ticket.human_id}`,
      `Subject:      ${ticket.subject}`,
      `Priority:     ${ticket.priority.toUpperCase()}`,
      `Status:       ${ticket.status.toUpperCase()}`,
      `Customer:     ${customer?.name || 'Customer'} (${customer?.email || 'N/A'})`,
      `Created At:   ${ticket.created_at}`,
      `Generated At: ${fastify.clock.now().toISOString()}`,
      `================================================================================\n`
    ];

    for (const e of events) {
      if (e.event_type === 'message') {
        transcriptLines.push(`[${e.created_at}] [${e.sender_type.toUpperCase()}]:`);
        transcriptLines.push(`${e.content}\n`);
      } else {
        transcriptLines.push(`[${e.created_at}] [EVENT]: ${e.event_type}`);
        if (e.metadata) {
          transcriptLines.push(`Details: ${JSON.stringify(e.metadata)}\n`);
        }
      }
    }

    const transcript = transcriptLines.join('\n');

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${ticket.human_id}_transcript.txt"`);
    return reply.send(transcript);
  });

  // 2. Internal Export (Leads and Admins only; includes notes clearly labeled)
  fastify.get<{ Params: { id: string } }>('/tickets/:id/export/internal', {
    preHandler: [fastify.requireRole('lead', 'admin')]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { id } = request.params;

    const ticketRes = await db.query<Ticket>('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];

    const custRes = await db.query<Customer>('SELECT * FROM customers WHERE id = $1', [ticket.customer_id]);
    const customer = custRes.rows[0];

    const publicEvents = await getCustomerThread(db, id);
    const internalNotes = await getInternalNotesForTicket(db, id);
    const auditRes = await db.query('SELECT * FROM audit_events WHERE ticket_id = $1 ORDER BY seq ASC', [id]);

    interface TimelineItem {
      timestamp: string;
      type: 'public_message' | 'internal_note' | 'event';
      author: string;
      body?: string | null;
      metadata?: unknown;
    }

    const timeline: TimelineItem[] = [];

    for (const p of publicEvents) {
      if (p.event_type === 'message') {
        timeline.push({
          timestamp: p.created_at,
          type: 'public_message',
          author: p.sender_type,
          body: p.content
        });
      } else {
        timeline.push({
          timestamp: p.created_at,
          type: 'event',
          author: p.sender_type,
          metadata: p.metadata
        });
      }
    }

    for (const n of internalNotes) {
      timeline.push({
        timestamp: n.created_at,
        type: 'internal_note',
        author: n.author_name || 'Agent',
        body: n.body
      });
    }

    // Sort unified timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const reportLines = [
      `################################################################################`,
      `ARVO SYSTEMS - INTERNAL AUDIT & SUPPORT REPORT (CONFIDENTIAL)`,
      `################################################################################`,
      `Ticket ID:      ${ticket.human_id}`,
      `Internal UUID:  ${ticket.id}`,
      `Subject:        ${ticket.subject}`,
      `Priority:       ${ticket.priority.toUpperCase()}`,
      `Status:         ${ticket.status.toUpperCase()}`,
      `Customer:       ${customer?.name || 'Customer'} (${customer?.email || 'N/A'})`,
      `Version:        ${ticket.version}`,
      `Cycle No:       ${ticket.cycle_no}`,
      `Exported By:    ${request.user.name} (${request.user.email})`,
      `Exported At:    ${fastify.clock.now().toISOString()}`,
      `################################################################################\n`,
      `--- CONVERSATION & INTERNAL NOTES TIMELINE ---`
    ];

    for (const item of timeline) {
      if (item.type === 'internal_note') {
        reportLines.push(`--------------------------------------------------------------------------------`);
        reportLines.push(`[${item.timestamp}] [INTERNAL NOTE - CONFIDENTIAL] Author: ${item.author}`);
        reportLines.push(`${item.body}\n`);
      } else if (item.type === 'public_message') {
        reportLines.push(`[${item.timestamp}] [PUBLIC MESSAGE] From: ${item.author}`);
        reportLines.push(`${item.body}\n`);
      } else {
        reportLines.push(`[${item.timestamp}] [PUBLIC LIFECYCLE EVENT] ${JSON.stringify(item.metadata)}\n`);
      }
    }

    reportLines.push(`--- AUDIT TRAIL SUMMARY (${auditRes.rows.length} chained events) ---`);
    for (const a of auditRes.rows) {
      reportLines.push(`Seq #${a.seq} | Event: ${a.event_type} | Actor: ${a.actor_type} (${a.actor_id || 'system'}) | Hash: ${a.hash}`);
    }

    const report = reportLines.join('\n');

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${ticket.human_id}_internal_export.txt"`);
    return reply.send(report);
  });
};

export default exportRoutes;
