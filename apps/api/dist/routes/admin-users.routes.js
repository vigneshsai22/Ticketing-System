"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const schemas_js_1 = require("../validation/schemas.js");
const adminUsersRoutes = async (fastify) => {
    // 1. List all agents/leads/admins (Admin only)
    fastify.get('/admin/users', {
        preHandler: [fastify.requireRole('admin')]
    }, async (_request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const res = await db.query('SELECT id, email, name, role, active, created_at FROM users ORDER BY role DESC, name ASC');
        return reply.send({ users: res.rows });
    });
    // 2. Create new user (Admin only)
    fastify.post('/admin/users', {
        preHandler: [fastify.requireRole('admin')]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.CreateUserSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { email, name, role } = val.data;
        const nowIso = fastify.clock.now().toISOString();
        const insertRes = await db.query(`INSERT INTO users (email, name, role, active, created_at)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING *`, [email.toLowerCase().trim(), name.trim(), role, nowIso]);
        const newUser = insertRes.rows[0];
        // Audit event
        await db.query(`INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'user_created', NULL, $2::jsonb, 'GENESIS', 'sha256_mock_hash', $3)`, [request.user.id, JSON.stringify(newUser), nowIso]);
        return reply.status(201).send({ user: newUser });
    });
    // 3. Update user: change role or deactivate/activate (Admin only)
    fastify.patch('/admin/users/:id', {
        preHandler: [fastify.requireRole('admin')]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.UpdateUserSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { id } = request.params;
        const { name, role, active } = val.data;
        const existingRes = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingRes.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }
        const oldUser = existingRes.rows[0];
        const updateRes = await db.query(`UPDATE users
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           active = COALESCE($3, active)
       WHERE id = $4
       RETURNING *`, [name, role, active, id]);
        const updatedUser = updateRes.rows[0];
        const nowIso = fastify.clock.now().toISOString();
        // Audit event for role/status changes
        await db.query(`INSERT INTO audit_events (
         actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
       ) VALUES ('agent', $1, 'user_updated', $2::jsonb, $3::jsonb, 'GENESIS', 'sha256_mock_hash', $4)`, [
            request.user.id,
            JSON.stringify({ role: oldUser.role, active: oldUser.active, name: oldUser.name }),
            JSON.stringify({ role: updatedUser.role, active: updatedUser.active, name: updatedUser.name }),
            nowIso
        ]);
        return reply.send({ user: updatedUser });
    });
};
exports.default = adminUsersRoutes;
//# sourceMappingURL=admin-users.routes.js.map