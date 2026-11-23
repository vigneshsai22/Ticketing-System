"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const schemas_js_1 = require("../validation/schemas.js");
const authRoutes = async (fastify) => {
    // 1. One-click demo login
    fastify.post('/auth/demo-login', async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.DemoLoginSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const db = await (0, client_js_1.getDbClient)();
        const { email, role } = val.data;
        let user = null;
        if (email) {
            const res = await db.query('SELECT * FROM users WHERE email = $1 AND active = TRUE', [email]);
            if (res.rows.length > 0)
                user = res.rows[0];
        }
        else if (role) {
            const res = await db.query('SELECT * FROM users WHERE role = $1 AND active = TRUE LIMIT 1', [role]);
            if (res.rows.length > 0)
                user = res.rows[0];
        }
        else {
            // Default to lead (Aria Chen)
            const res = await db.query('SELECT * FROM users WHERE role = $1 AND active = TRUE LIMIT 1', ['lead']);
            if (res.rows.length > 0)
                user = res.rows[0];
        }
        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        };
        const token = fastify.jwt.sign(payload, { expiresIn: '7d' });
        reply.setCookie('frontdesk_session', token, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60
        });
        return reply.send({
            user: payload,
            token
        });
    });
    // 2. Current authenticated user profile
    fastify.get('/auth/me', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        return reply.send({ user: request.user });
    });
    // 3. Logout
    fastify.post('/auth/logout', async (_request, reply) => {
        reply.clearCookie('frontdesk_session', { path: '/' });
        return reply.send({ success: true });
    });
    // 4. List seeded demo users for 1-click UI switcher
    fastify.get('/auth/demo-users', async (_request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const res = await db.query('SELECT id, email, name, role, active FROM users ORDER BY role DESC, name ASC');
        return reply.send({ users: res.rows });
    });
};
exports.default = authRoutes;
//# sourceMappingURL=auth.routes.js.map