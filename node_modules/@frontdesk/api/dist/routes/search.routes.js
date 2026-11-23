"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const search_service_js_1 = require("../services/search.service.js");
const searchRoutes = async (fastify) => {
    // 1. Public Search: INC id, subject, customer, public message text.
    // INC-0304: Strictly excludes internal notes.
    fastify.get('/search', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const query = request.query.q || '';
        if (!query.trim()) {
            return reply.send({ results: [] });
        }
        const results = await (0, search_service_js_1.searchPublicTickets)(db, query);
        return reply.send({ results });
    });
    // 2. Internal Search: Separate code path, agent/lead only.
    // Also searches internal notes with snippet highlighting.
    fastify.get('/search/internal', {
        preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const query = request.query.q || '';
        if (!query.trim()) {
            return reply.send({ results: [] });
        }
        const results = await (0, search_service_js_1.searchInternalTickets)(db, query);
        return reply.send({ results });
    });
};
exports.default = searchRoutes;
//# sourceMappingURL=search.routes.js.map