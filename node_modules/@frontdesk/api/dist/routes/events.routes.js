"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sse_service_js_1 = require("../services/sse.service.js");
const schemas_js_1 = require("../validation/schemas.js");
const eventsRoutes = async (fastify) => {
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
        const listener = (event) => {
            reply.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
        };
        sse_service_js_1.sseBroadcaster.on('broadcast', listener);
        request.raw.on('close', () => {
            sse_service_js_1.sseBroadcaster.off('broadcast', listener);
        });
    });
    // 2. Presence tracking: "X is viewing ticket Y"
    fastify.post('/events/presence', {
        preHandler: [fastify.requireRole('agent', 'lead', 'admin')]
    }, async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.PresenceSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const { ticket_id, action = 'viewing' } = val.data;
        sse_service_js_1.sseBroadcaster.broadcastPresence(request.user.id, request.user.name, ticket_id, action);
        return reply.send({ success: true });
    });
};
exports.default = eventsRoutes;
//# sourceMappingURL=events.routes.js.map