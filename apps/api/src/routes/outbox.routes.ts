import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { OutboxEmail } from '@frontdesk/shared';

const outboxRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /admin/outbox: View simulated transactional emails (Leads & Admins)
  fastify.get<{
    Querystring: { recipient?: string; status?: string; limit?: number };
  }>('/admin/outbox', {
    preHandler: [fastify.requireRole('lead', 'admin')]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { recipient, status, limit = 50 } = request.query;

    let sql = 'SELECT * FROM outbox WHERE 1=1';
    const params: unknown[] = [];

    if (recipient) {
      params.push(`%${recipient}%`);
      sql += ` AND recipient_email ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const res = await db.query<OutboxEmail>(sql, params);
    return reply.send({ outbox: res.rows });
  });
};

export default outboxRoutes;
