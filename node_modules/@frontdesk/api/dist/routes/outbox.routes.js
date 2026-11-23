"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const outboxRoutes = async (fastify) => {
    // GET /admin/outbox: View simulated transactional emails (Leads & Admins)
    fastify.get('/admin/outbox', {
        preHandler: [fastify.requireRole('lead', 'admin')]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { recipient, status, limit = 50 } = request.query;
        let sql = 'SELECT * FROM outbox WHERE 1=1';
        const params = [];
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
        const res = await db.query(sql, params);
        return reply.send({ outbox: res.rows });
    });
};
exports.default = outboxRoutes;
//# sourceMappingURL=outbox.routes.js.map