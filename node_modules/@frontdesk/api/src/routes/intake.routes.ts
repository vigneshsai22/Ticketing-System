import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { Customer, TicketPriority } from '@frontdesk/shared';
import { createTicket } from '../services/ticket.service.js';
import { enqueueOutboxEmail } from '../services/outbox.service.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { IntakeTicketSchema, validateWithZod } from '../validation/schemas.js';

interface IntakeBody {
  channel?: 'phone' | 'email' | 'in_person';
  customer: {
    email: string;
    name: string;
    organization?: string;
  };
  subject: string;
  priority: TicketPriority;
  initialMessage?: string;
}

const intakeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Agent-created ticket on behalf of a customer (phone/email/in_person intake)
  fastify.post<{ Body: IntakeBody }>('/tickets/intake', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(IntakeTicketSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { channel, customer, subject, priority, initialMessage } = val.data;

    const nowIso = fastify.clock.now().toISOString();

    // 1. Lookup or create customer
    let customerRecord: Customer;
    const existingCust = await db.query<Customer>(
      'SELECT * FROM customers WHERE email = $1',
      [customer.email.toLowerCase().trim()]
    );

    if (existingCust.rows.length > 0) {
      customerRecord = existingCust.rows[0];
      // Update organization or name if newly provided
      if (customer.organization || customer.name !== customerRecord.name) {
        const updateCust = await db.query<Customer>(
          `UPDATE customers 
           SET name = COALESCE($1, name), organization = COALESCE($2, organization) 
           WHERE id = $3 RETURNING *`,
          [customer.name, customer.organization || null, customerRecord.id]
        );
        customerRecord = updateCust.rows[0];
      }
    } else {
      const newCust = await db.query<Customer>(
        `INSERT INTO customers (email, name, organization, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [customer.email.toLowerCase().trim(), customer.name.trim(), customer.organization || null, nowIso]
      );
      customerRecord = newCust.rows[0];
    }

    // 2. Create ticket via core service
    const ticket = await createTicket(db, fastify.clock, {
      subject,
      priority,
      customerId: customerRecord.id,
      initialMessage,
      creatorId: request.user.id,
      creatorType: 'agent'
    });

    // 3. If initial message was provided, record it in public_messages
    if (initialMessage && initialMessage.trim().length > 0) {
      await db.query(
        `INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, created_at)
         VALUES ($1, 'customer', $2, $3, $4)`,
        [ticket.id, customerRecord.id, initialMessage.trim(), nowIso]
      );
    }

    // 4. Record intake audit event
    await recordAuditEvent(db, fastify.clock, {
      ticketId: ticket.id,
      actorType: 'agent',
      actorId: request.user.id,
      eventType: 'ticket_intake_created',
      before: null,
      after: {
        channel: channel || 'phone',
        customer_id: customerRecord.id,
        customer_email: customerRecord.email,
        agent_id: request.user.id
      }
    });

    // 5. Enqueue outbox email notification to customer (via customer serializer)
    await enqueueOutboxEmail(db, fastify.clock, {
      recipientEmail: customerRecord.email,
      template: 'ticket_created',
      customerName: customerRecord.name,
      ticketHumanId: ticket.human_id,
      ticketSubject: ticket.subject
    });

    return reply.status(201).send({
      success: true,
      ticket,
      customer: customerRecord
    });
  });
};

export default intakeRoutes;
