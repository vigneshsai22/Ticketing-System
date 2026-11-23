"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const clock_js_1 = __importDefault(require("./plugins/clock.js"));
const auth_js_1 = __importDefault(require("./plugins/auth.js"));
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const ticket_routes_js_1 = __importDefault(require("./routes/ticket.routes.js"));
const priority_routes_js_1 = __importDefault(require("./routes/priority.routes.js"));
const agent_reply_routes_js_1 = __importDefault(require("./routes/agent-reply.routes.js"));
const customer_routes_js_1 = __importDefault(require("./routes/customer.routes.js"));
const export_routes_js_1 = __importDefault(require("./routes/export.routes.js"));
const events_routes_js_1 = __importDefault(require("./routes/events.routes.js"));
const search_routes_js_1 = __importDefault(require("./routes/search.routes.js"));
const canned_replies_routes_js_1 = __importDefault(require("./routes/canned-replies.routes.js"));
const intake_routes_js_1 = __importDefault(require("./routes/intake.routes.js"));
const admin_users_routes_js_1 = __importDefault(require("./routes/admin-users.routes.js"));
const outbox_routes_js_1 = __importDefault(require("./routes/outbox.routes.js"));
const time_machine_routes_js_1 = __importDefault(require("./routes/time-machine.routes.js"));
const analytics_routes_js_1 = __importDefault(require("./routes/analytics.routes.js"));
const admin_settings_routes_js_1 = __importDefault(require("./routes/admin-settings.routes.js"));
const scheduler_service_js_1 = require("./services/scheduler.service.js");
const client_js_1 = require("./db/client.js");
const static_1 = __importDefault(require("@fastify/static"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
async function buildApp(opts = {}) {
    const app = (0, fastify_1.default)({
        logger: opts.logger ?? false,
        trustProxy: true,
        ...opts
    });
    // 1. CORS
    await app.register(cors_1.default, {
        origin: true,
        credentials: true
    });
    // 1a. Security Headers & CSRF Protection
    app.addHook('onRequest', async (request, reply) => {
        // Standard OWASP Security Headers
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'SAMEORIGIN');
        reply.header('X-XSS-Protection', '0');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:;");
        // CSRF Check for state-mutating requests that rely on cookies
        const mutatingMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
        if (mutatingMethods.includes(request.method)) {
            const cookieHeader = request.headers.cookie || '';
            const hasCookieSession = cookieHeader.includes('frontdesk_session=');
            const authHeader = request.headers.authorization;
            const origin = request.headers.origin;
            // If relying exclusively on session cookie without bearer auth
            if (hasCookieSession && !authHeader && origin) {
                try {
                    const originHost = new URL(origin).host;
                    const reqHost = request.headers.host;
                    if (reqHost && originHost !== reqHost && !originHost.includes('localhost') && !originHost.includes('127.0.0.1')) {
                        return reply.status(403).send({ error: 'Forbidden: CSRF check failed, untrusted origin' });
                    }
                }
                catch {
                    return reply.status(403).send({ error: 'Forbidden: invalid origin header' });
                }
            }
        }
    });
    // 2. Core Plugins
    await app.register(clock_js_1.default, { clock: opts.clock });
    await app.register(auth_js_1.default);
    // 3. Health Check
    app.get('/api/health', async () => {
        return {
            status: 'ok',
            time: app.clock.now().toISOString(),
            service: 'frontdesk-api'
        };
    });
    // 4. API Routes
    await app.register(auth_routes_js_1.default, { prefix: '/api' });
    await app.register(ticket_routes_js_1.default, { prefix: '/api' });
    await app.register(priority_routes_js_1.default, { prefix: '/api' });
    await app.register(agent_reply_routes_js_1.default, { prefix: '/api' });
    await app.register(customer_routes_js_1.default, { prefix: '/api' });
    await app.register(export_routes_js_1.default, { prefix: '/api' });
    await app.register(events_routes_js_1.default, { prefix: '/api' });
    await app.register(search_routes_js_1.default, { prefix: '/api' });
    await app.register(canned_replies_routes_js_1.default, { prefix: '/api' });
    await app.register(intake_routes_js_1.default, { prefix: '/api' });
    await app.register(admin_users_routes_js_1.default, { prefix: '/api' });
    await app.register(outbox_routes_js_1.default, { prefix: '/api' });
    await app.register(time_machine_routes_js_1.default, { prefix: '/api' });
    await app.register(analytics_routes_js_1.default, { prefix: '/api' });
    await app.register(admin_settings_routes_js_1.default, { prefix: '/api' });
    // 5. Static Web UI Serving & SPA Fallback (Single Deployable Service)
    const webDistPath = path.resolve(__dirname, '../../web/dist');
    if (fs.existsSync(webDistPath)) {
        await app.register(static_1.default, {
            root: webDistPath,
            wildcard: false
        });
        app.setNotFoundHandler((request, reply) => {
            if (request.raw.url && request.raw.url.startsWith('/api')) {
                return reply.status(404).send({ error: 'Endpoint not found' });
            }
            return reply.sendFile('index.html');
        });
    }
    // 6. Periodic Scheduler Loop (if enabled)
    if (opts.enableSchedulerTimer) {
        const timer = setInterval(async () => {
            try {
                const db = await (0, client_js_1.getDbClient)();
                await (0, scheduler_service_js_1.runSchedulerPass)(db, app.clock);
            }
            catch (err) {
                app.log.error(err, 'Periodic scheduler error');
            }
        }, 60000);
        // Unref so process is not kept alive solely by the timer
        timer.unref();
        app.addHook('onClose', (_instance, done) => {
            clearInterval(timer);
            done();
        });
    }
    return app;
}
//# sourceMappingURL=app.js.map