import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { ShiftableClock } from '@frontdesk/shared';
import clockPlugin from './plugins/clock.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import priorityRoutes from './routes/priority.routes.js';
import agentReplyRoutes from './routes/agent-reply.routes.js';
import customerRoutes from './routes/customer.routes.js';
import exportRoutes from './routes/export.routes.js';
import eventsRoutes from './routes/events.routes.js';
import searchRoutes from './routes/search.routes.js';
import cannedRepliesRoutes from './routes/canned-replies.routes.js';
import intakeRoutes from './routes/intake.routes.js';
import adminUsersRoutes from './routes/admin-users.routes.js';
import outboxRoutes from './routes/outbox.routes.js';
import timeMachineRoutes from './routes/time-machine.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import adminSettingsRoutes from './routes/admin-settings.routes.js';
import { runSchedulerPass } from './services/scheduler.service.js';
import { getDbClient } from './db/client.js';
import fastifyStatic from '@fastify/static';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface BuildAppOptions extends FastifyServerOptions {
  clock?: ShiftableClock;
  enableSchedulerTimer?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    ...opts
  });

  // 1. CORS
  await app.register(cors, {
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
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:;"
    );

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
        } catch {
          return reply.status(403).send({ error: 'Forbidden: invalid origin header' });
        }
      }
    }
  });

  // 2. Core Plugins
  await app.register(clockPlugin, { clock: opts.clock });
  await app.register(authPlugin);

  // 3. Health Check
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      time: app.clock.now().toISOString(),
      service: 'frontdesk-api'
    };
  });

  // 4. API Routes
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(ticketRoutes, { prefix: '/api' });
  await app.register(priorityRoutes, { prefix: '/api' });
  await app.register(agentReplyRoutes, { prefix: '/api' });
  await app.register(customerRoutes, { prefix: '/api' });
  await app.register(exportRoutes, { prefix: '/api' });
  await app.register(eventsRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(cannedRepliesRoutes, { prefix: '/api' });
  await app.register(intakeRoutes, { prefix: '/api' });
  await app.register(adminUsersRoutes, { prefix: '/api' });
  await app.register(outboxRoutes, { prefix: '/api' });
  await app.register(timeMachineRoutes, { prefix: '/api' });
  await app.register(analyticsRoutes, { prefix: '/api' });
  await app.register(adminSettingsRoutes, { prefix: '/api' });

  // 5. Static Web UI Serving & SPA Fallback (Single Deployable Service)
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
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
        const db = await getDbClient();
        await runSchedulerPass(db, app.clock);
      } catch (err) {
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
