import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDbClient } from '../db/client.js';
import { TicketPriority, Customer } from '@frontdesk/shared';
import { createTicket } from '../services/ticket.service.js';
import {
  getCustomerTicketById,
  getCustomerThread,
  addCustomerMessage,
  reopenOrSpawnLinkedTicket
} from '../services/customer/customer.repository.js';
import { serializeCustomerTicket } from '../services/customer-serializer.js';
import { createMagicLink, verifyMagicLink, checkRateLimit } from '../services/magic-link.service.js';
import { enqueueOutboxEmail } from '../services/outbox.service.js';
import { sseBroadcaster } from '../services/sse.service.js';
import {
  CustomerCreateTicketSchema,
  CustomerReplySchema,
  CustomerReopenSchema,
  validateWithZod
} from '../validation/schemas.js';

const customerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Rate limiting hook for all customer routes with standard rate-limit headers
  fastify.addHook('preHandler', async (request, reply) => {
    const ip = request.ip || 'anonymous';
    const token =
      (request.headers['x-magic-link-token'] as string) ||
      (request.query as { token?: string })?.token;
    const rateLimitKey = token ? `token:${token}` : `ip:${ip}`;
    const rateCheck = checkRateLimit(rateLimitKey, fastify.clock, 60, 60_000);

    reply.header('X-RateLimit-Limit', rateCheck.limit);
    reply.header('X-RateLimit-Remaining', rateCheck.remaining);
    reply.header('X-RateLimit-Reset', rateCheck.resetSeconds);

    if (!rateCheck.allowed) {
      reply.header('Retry-After', rateCheck.resetSeconds);
      return reply.status(429).send({ error: 'Too many requests. Please wait before trying again.' });
    }
  });

  // Helper to verify magic link from header or query
  async function resolveCustomerAuth(
    request: FastifyRequest<{ Querystring: { token?: string } }>,
    reply: FastifyReply
  ): Promise<{ customerId?: string; ticketId?: string } | null> {
    const token =
      (request.headers['x-magic-link-token'] as string) ||
      (request.query?.token as string);

    if (!token) {
      reply.status(401).send({ error: 'Missing magic-link authentication token' });
      return null;
    }

    const db = await getDbClient();
    const link = await verifyMagicLink(db, fastify.clock, token);

    if (!link) {
      reply.status(401).send({ error: 'Invalid or expired magic-link token' });
      return null;
    }

    return {
      customerId: link.customer_id || undefined,
      ticketId: link.ticket_id || undefined
    };
  }

  // 1. Customer creates ticket directly with severity/priority choice
  fastify.post<{
    Body: {
      email: string;
      name: string;
      subject: string;
      priority: TicketPriority;
      message: string;
    };
  }>('/customer/tickets', async (request, reply) => {
    const val = validateWithZod(CustomerCreateTicketSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { email, name, subject, priority, message } = val.data;

    const nowIso = fastify.clock.now().toISOString();

    // Customer lookup or create
    let customer: Customer;
    const existing = await db.query<Customer>('SELECT * FROM customers WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      customer = existing.rows[0];
    } else {
      const inserted = await db.query<Customer>(
        `INSERT INTO customers (email, name, created_at) VALUES ($1, $2, $3) RETURNING *`,
        [email.toLowerCase().trim(), name.trim(), nowIso]
      );
      customer = inserted.rows[0];
    }

    // Create ticket via service
    const ticket = await createTicket(db, fastify.clock, {
      subject: subject.trim(),
      priority,
      customerId: customer.id,
      creatorId: customer.id,
      creatorType: 'customer'
    });

    // Record initial message
    await db.query(
      `INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, created_at)
       VALUES ($1, 'customer', $2, $3, $4)`,
      [ticket.id, customer.id, message.trim(), nowIso]
    );

    // Generate magic link token for this ticket
    const { rawToken } = await createMagicLink(db, fastify.clock, {
      customerId: customer.id,
      ticketId: ticket.id,
      expiresInHours: 72
    });

    const magicUrl = `https://frontdesk.arvo.internal/portal/tickets/${ticket.id}?token=${rawToken}`;

    // Send confirmation email via outbox
    await enqueueOutboxEmail(db, fastify.clock, {
      recipientEmail: customer.email,
      template: 'ticket_created',
      customerName: customer.name,
      ticketHumanId: ticket.human_id,
      ticketSubject: ticket.subject,
      magicLinkUrl: magicUrl
    });

    return reply.status(201).send({
      success: true,
      ticket: serializeCustomerTicket(ticket as unknown as Record<string, unknown>),
      token: rawToken,
      magic_link_url: magicUrl
    });
  });

  // 2. View ticket (requires valid magic link token)
  fastify.get<{
    Params: { id: string };
    Querystring: { token?: string };
  }>('/customer/tickets/:id', async (request, reply) => {
    const auth = await resolveCustomerAuth(request, reply);
    if (!auth) return;

    const db = await getDbClient();
    const { id } = request.params;

    // Must match authorized ticket or customer
    if (auth.ticketId && auth.ticketId !== id) {
      return reply.status(403).send({ error: 'Token not authorized for this ticket' });
    }

    const ticket = await getCustomerTicketById(db, id, auth.customerId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return reply.send({
      ticket: serializeCustomerTicket(ticket as unknown as Record<string, unknown>)
    });
  });

  // 3. View public thread (uses customer_visible_events view)
  fastify.get<{
    Params: { id: string };
    Querystring: { token?: string };
  }>('/customer/tickets/:id/thread', async (request, reply) => {
    const auth = await resolveCustomerAuth(request, reply);
    if (!auth) return;

    const db = await getDbClient();
    const { id } = request.params;

    if (auth.ticketId && auth.ticketId !== id) {
      return reply.status(403).send({ error: 'Token not authorized for this ticket' });
    }

    const events = await getCustomerThread(db, id);
    return reply.send({ thread: events });
  });

  // 4. Customer reply (resumes clocks & moves status out of waiting_on_customer)
  fastify.post<{
    Params: { id: string };
    Body: { body: string };
    Querystring: { token?: string };
  }>('/customer/tickets/:id/reply', async (request, reply) => {
    const auth = await resolveCustomerAuth(request, reply);
    if (!auth) return;

    const val = validateWithZod(CustomerReplySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { id } = request.params;
    const { body } = val.data;
    const idempotencyKey = (request.headers['idempotency-key'] as string) || undefined;

    if (auth.ticketId && auth.ticketId !== id) {
      return reply.status(403).send({ error: 'Token not authorized for this ticket' });
    }

    // Resolve customer ID
    let customerId = auth.customerId;
    if (!customerId) {
      const ticket = await getCustomerTicketById(db, id);
      customerId = ticket?.customer_id;
    }

    if (!customerId) {
      return reply.status(400).send({ error: 'Could not determine customer identity' });
    }

    await addCustomerMessage(db, fastify.clock, id, customerId, body.trim(), idempotencyKey);

    // Broadcast SSE update to agents
    sseBroadcaster.broadcast('new_message', {
      ticket_id: id,
      sender_type: 'customer',
      sender_id: customerId
    });

    return reply.send({ success: true, message: 'Reply sent successfully' });
  });

  // 5. Customer reopen within window (fresh cycle) or create linked ticket
  fastify.post<{
    Params: { id: string };
    Body: { reason?: string };
    Querystring: { token?: string };
  }>('/customer/tickets/:id/reopen', async (request, reply) => {
    const auth = await resolveCustomerAuth(request, reply);
    if (!auth) return;

    const val = validateWithZod(CustomerReopenSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { id } = request.params;
    const reason = val.data?.reason;

    if (auth.ticketId && auth.ticketId !== id) {
      return reply.status(403).send({ error: 'Token not authorized for this ticket' });
    }

    let customerId = auth.customerId;
    if (!customerId) {
      const t = await getCustomerTicketById(db, id);
      customerId = t?.customer_id;
    }

    if (!customerId) {
      return reply.status(400).send({ error: 'Could not determine customer identity' });
    }

    const result = await reopenOrSpawnLinkedTicket(db, fastify.clock, id, customerId, reason);

    return reply.send({
      success: true,
      reopened: result.reopened,
      new_ticket_created: result.newTicketCreated,
      ticket: serializeCustomerTicket(result.ticket as unknown as Record<string, unknown>)
    });
  });
};

export default customerRoutes;
