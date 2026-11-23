"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const scheduler_service_js_1 = require("../services/scheduler.service.js");
const sla_sync_service_js_1 = require("../services/sla-sync.service.js");
const sla_1 = require("@frontdesk/sla");
const schemas_js_1 = require("../validation/schemas.js");
const timeMachineRoutes = async (fastify) => {
    // Helper to format clock state for API and UI banner
    const formatClockState = (summary) => {
        const state = fastify.clock.getState();
        const now = fastify.clock.now();
        const dt = (0, sla_1.toDateTime)(now, 'Asia/Kolkata');
        const isShifted = Boolean(state.offsetMs !== 0 || state.frozen);
        const bannerMessage = isShifted
            ? `⚠️ Time Machine Active: Clock is ${state.frozen ? 'frozen at' : 'shifted to'} ${dt.toFormat('EEE, dd LLL yyyy, HH:mm:ss')} IST`
            : '';
        return {
            current_time: now.toISOString(),
            offset_ms: state.offsetMs,
            frozen: Boolean(state.frozen),
            is_shifted: isShifted,
            banner: {
                active: isShifted,
                message: bannerMessage,
                formatted_time: dt.toFormat('EEE, dd LLL yyyy, HH:mm:ss') + ' IST',
                label: isShifted ? 'SIMULATED TIME' : 'REAL TIME'
            },
            scheduler_summary: summary || null
        };
    };
    /**
     * GET /api/demo/time
     * Returns current clock status, offset, and banner state for the UI.
     */
    fastify.get('/demo/time', async (_request, reply) => {
        return reply.send(formatClockState());
    });
    /**
     * POST /api/demo/time/jump
     * Jumps to named canonical moments:
     * - "Friday 18:00" -> 2026-03-06T18:00:00+05:30
     * - "Saturday" -> 2026-03-07T12:00:00+05:30
     * - "Monday 11:01" -> 2026-03-09T11:01:00+05:30
     * - "+1 working day" -> Adds 540 business minutes
     * Immediately runs the scheduler pass after the jump.
     */
    fastify.post('/demo/time/jump', async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.TimeJumpSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const { target } = val.data;
        const db = await (0, client_js_1.getDbClient)();
        const slaContext = await (0, sla_sync_service_js_1.loadSlaContext)(db);
        const normalizedTarget = target.trim().toLowerCase();
        if (normalizedTarget === 'friday 18:00' || normalizedTarget === 'friday 6pm') {
            fastify.clock.set('2026-03-06T18:00:00.000+05:30', false);
        }
        else if (normalizedTarget === 'saturday') {
            fastify.clock.set('2026-03-07T12:00:00.000+05:30', false);
        }
        else if (normalizedTarget === 'monday 11:01' || normalizedTarget === 'monday 11:00') {
            fastify.clock.set('2026-03-09T11:01:00.000+05:30', false);
        }
        else if (normalizedTarget === '+1 working day' || normalizedTarget === '+1 business day') {
            const nextBusinessDay = (0, sla_1.addBusinessMinutes)(fastify.clock.now(), 540, [], slaContext.workingHours, slaContext.holidays);
            fastify.clock.set(nextBusinessDay.toISO(), false);
        }
        else {
            // Attempt generic parse
            const parsed = (0, sla_1.toDateTime)(target, slaContext.workingHours.timezone);
            if (parsed.isValid) {
                fastify.clock.set(parsed.toJSDate().toISOString(), false);
            }
            else {
                return reply.status(400).send({
                    error: `Unrecognized jump target: "${target}". Expected "Friday 18:00", "Saturday", "Monday 11:01", or "+1 working day".`
                });
            }
        }
        // Run scheduler immediately after jump
        const summary = await (0, scheduler_service_js_1.runSchedulerPass)(db, fastify.clock);
        return reply.send(formatClockState(summary));
    });
    /**
     * POST /api/demo/time/shift
     * Shifts clock by minutes, hours, or days.
     * Runs the scheduler immediately after.
     */
    fastify.post('/demo/time/shift', async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.TimeShiftSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const { minutes, hours, days } = val.data;
        if (minutes)
            fastify.clock.shiftByMinutes(minutes);
        if (hours)
            fastify.clock.shiftByHours(hours);
        if (days)
            fastify.clock.shiftByDays(days);
        const db = await (0, client_js_1.getDbClient)();
        const summary = await (0, scheduler_service_js_1.runSchedulerPass)(db, fastify.clock);
        return reply.send(formatClockState(summary));
    });
    /**
     * POST /api/demo/time/set
     * Sets clock to specific ISO time.
     * Runs the scheduler immediately after.
     */
    fastify.post('/demo/time/set', async (request, reply) => {
        const val = (0, schemas_js_1.validateWithZod)(schemas_js_1.TimeSetSchema, request.body || {});
        if (!val.success) {
            return reply.status(400).send({ error: val.error, issues: val.issues });
        }
        const { time } = val.data;
        const freeze = request.body?.freeze;
        fastify.clock.set(time, freeze ?? false);
        const db = await (0, client_js_1.getDbClient)();
        const summary = await (0, scheduler_service_js_1.runSchedulerPass)(db, fastify.clock);
        return reply.send(formatClockState(summary));
    });
    /**
     * POST /api/demo/time/reset
     * Resets clock to real system time.
     * Runs the scheduler immediately after.
     */
    fastify.post('/demo/time/reset', async (_request, reply) => {
        fastify.clock.reset();
        const db = await (0, client_js_1.getDbClient)();
        const summary = await (0, scheduler_service_js_1.runSchedulerPass)(db, fastify.clock);
        return reply.send(formatClockState(summary));
    });
    /**
     * POST /api/scheduler/run
     * Explicitly triggers an idempotent scheduler pass.
     */
    fastify.post('/scheduler/run', async (_request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const summary = await (0, scheduler_service_js_1.runSchedulerPass)(db, fastify.clock);
        return reply.send({
            success: true,
            timestamp: fastify.clock.now().toISOString(),
            summary
        });
    });
};
exports.default = timeMachineRoutes;
//# sourceMappingURL=time-machine.routes.js.map