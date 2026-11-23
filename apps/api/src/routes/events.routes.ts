import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sseBroadcaster, SseEvent } from '../services/sse.service.js';
import { PresenceSchema, validateWithZod } from '../validation/schemas.js';

const eventsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. SSE Stream: Agent and Lead only; customers get no stream!
  fastify.get('/events', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial handshake
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ userId: request.user.id, time: fastify.clock.now().toISOString() })}\n\n`);

    const listener = (event: SseEvent) => {
      reply.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };

    sseBroadcaster.on('broadcast', listener);

    request.raw.on('close', () => {
      sseBroadcaster.off('broadcast', listener);
    });
  });

  // 2. Presence tracking: "X is viewing ticket Y"
  fastify.post<{
    Body: { ticket_id: string; action?: 'viewing' | 'left' };
  }>('/events/presence', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(PresenceSchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const { ticket_id, action = 'viewing' } = val.data;

    sseBroadcaster.broadcastPresence(request.user.id, request.user.name, ticket_id, action);
    return reply.send({ success: true });
  });
};

export default eventsRoutes;
