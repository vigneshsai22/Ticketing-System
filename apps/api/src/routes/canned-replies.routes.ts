import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDbClient } from '../db/client.js';
import { CannedReply } from '@frontdesk/shared';
import {
  CreateCannedReplySchema,
  UpdateCannedReplySchema,
  validateWithZod
} from '../validation/schemas.js';

const cannedRepliesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. List / Search Canned Replies (Agents, Leads, Admins)
  fastify.get<{
    Querystring: { category?: string; search?: string };
  }>('/canned-replies', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { category, search } = request.query;

    let sql = 'SELECT * FROM canned_replies WHERE 1=1';
    const params: unknown[] = [];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (title ILIKE $${params.length} OR content ILIKE $${params.length} OR shortcut ILIKE $${params.length})`;
    }
    sql += ' ORDER BY title ASC';

    const res = await db.query<CannedReply>(sql, params);
    return reply.send({ canned_replies: res.rows });
  });

  // 2. Create Canned Reply (Lead or Admin only)
  fastify.post<{
    Body: { title: string; content: string; shortcut?: string; category?: string };
  }>('/canned-replies', {
    preHandler: [fastify.requireRole('lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(CreateCannedReplySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { title, content, shortcut, category } = val.data;

    const res = await db.query<CannedReply>(
      `INSERT INTO canned_replies (title, content, shortcut, category)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, content, shortcut || null, category || 'general']
    );

    return reply.status(201).send({ canned_reply: res.rows[0] });
  });

  // 3. Update Canned Reply (Lead or Admin only)
  fastify.patch<{
    Params: { id: string };
    Body: { title?: string; content?: string; shortcut?: string; category?: string };
  }>('/canned-replies/:id', {
    preHandler: [fastify.requireRole('lead', 'admin')]
  }, async (request, reply) => {
    const val = validateWithZod(UpdateCannedReplySchema, request.body || {});
    if (!val.success) {
      return reply.status(400).send({ error: val.error, issues: val.issues });
    }

    const db = await getDbClient();
    const { id } = request.params;
    const { title, content, shortcut, category } = val.data;

    const existing = await db.query('SELECT * FROM canned_replies WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Canned reply not found' });
    }

    const res = await db.query<CannedReply>(
      `UPDATE canned_replies
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           shortcut = COALESCE($3, shortcut),
           category = COALESCE($4, category)
       WHERE id = $5
       RETURNING *`,
      [title, content, shortcut, category, id]
    );

    return reply.send({ canned_reply: res.rows[0] });
  });

  // 4. Delete Canned Reply (Lead or Admin only)
  fastify.delete<{ Params: { id: string } }>('/canned-replies/:id', {
    preHandler: [fastify.requireRole('lead', 'admin')]
  }, async (request, reply) => {
    const db = await getDbClient();
    const { id } = request.params;

    const res = await db.query('DELETE FROM canned_replies WHERE id = $1 RETURNING id', [id]);
    if (res.rowCount === 0) {
      return reply.status(404).send({ error: 'Canned reply not found' });
    }

    return reply.send({ success: true, deleted_id: id });
  });
};

export default cannedRepliesRoutes;
