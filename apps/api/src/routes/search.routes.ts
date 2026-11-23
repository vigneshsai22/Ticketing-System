import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { searchPublicTickets, searchInternalTickets } from '../services/search.service.js';

const searchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Public Search: INC id, subject, customer, public message text.
  // INC-0304: Strictly excludes internal notes.
  fastify.get<{
    Querystring: { q?: string };
  }>('/search', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const db = await getDbClient();
    const query = request.query.q || '';
    if (!query.trim()) {
      return reply.send({ results: [] });
    }

    const results = await searchPublicTickets(db, query);
    return reply.send({ results });
  });

  // 2. Internal Search: Separate code path, agent/lead only.
  // Also searches internal notes with snippet highlighting.
  fastify.get<{
    Querystring: { q?: string };
  }>('/search/internal', {
    preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
  }, async (request, reply) => {
    const db = await getDbClient();
    const query = request.query.q || '';
    if (!query.trim()) {
      return reply.send({ results: [] });
    }

    const results = await searchInternalTickets(db, query);
    return reply.send({ results });
  });
};

export default searchRoutes;
