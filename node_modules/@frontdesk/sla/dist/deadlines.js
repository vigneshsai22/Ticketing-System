"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDeadlines = computeDeadlines;
exports.recomputeOnPriorityChange = recomputeOnPriorityChange;
const business_time_js_1 = require("./business-time.js");
/**
 * Computes response and resolution deadlines for a ticket cycle given an SLA policy
 * and any recorded pause intervals.
 *
 * Implements the special Urgent SLA rule:
 * "urgent: respond 120, resolve = end of the working day that contains the response deadline"
 */
function computeDeadlines(cycle, policy, pauses = [], config = business_time_js_1.DEFAULT_WORKING_HOURS, holidays = []) {
    const clockStartNormalized = (0, business_time_js_1.nextWorkingInstant)(cycle.clock_start, config, holidays);
    // 1. Response Deadline
    const responseDue = (0, business_time_js_1.addBusinessMinutes)(clockStartNormalized, policy.respond_minutes, pauses, config, holidays);
    // 2. Resolution Deadline
    let resolveDue;
    if (policy.resolve_mode === 'end_of_response_day') {
        // For urgent: end of the working day containing the response deadline (18:30 Asia/Kolkata).
        // If pauses occurred between responseDue and the end of that day, elongate accordingly.
        const baseDayEnd = (0, business_time_js_1.getEndOfWorkingDay)(responseDue, config);
        if (baseDayEnd >= responseDue) {
            // Find remaining business minutes in that day from responseDue
            const remainingMinutesInDay = (0, business_time_js_1.businessMinutesBetween)(responseDue, baseDayEnd, [], config, holidays);
            resolveDue = (0, business_time_js_1.addBusinessMinutes)(responseDue, remainingMinutesInDay, pauses, config, holidays);
        }
        else {
            resolveDue = baseDayEnd;
        }
    }
    else {
        // Standard fixed minutes resolution SLA
        resolveDue = (0, business_time_js_1.addBusinessMinutes)(clockStartNormalized, policy.resolve_minutes, pauses, config, holidays);
    }
    return {
        responseDue,
        resolveDue,
        clockStartNormalized
    };
}
/**
 * Recomputes deadlines on mid-ticket priority change from the original clock start
 * excluding paused time.
 *
 * Rules:
 * - Breaches already recorded are NEVER erased (even if downgraded).
 * - If an upgrade causes a deadline to retroactively fall in the past,
 *   record breach reason "escalated_mid_flight".
 */
function recomputeOnPriorityChange(cycle, oldPolicy, newPolicy, pauses = [], nowInput, config = business_time_js_1.DEFAULT_WORKING_HOURS, holidays = []) {
    const now = (0, business_time_js_1.toDateTime)(nowInput, config.timezone);
    const nowIso = now.toUTC().toISO();
    // Compute new deadlines under new policy from the original clock start
    const newDeadlines = computeDeadlines(cycle, newPolicy, pauses, config, holidays);
    let responseBreached = Boolean(cycle.response_breached_at);
    let responseBreachedAt = cycle.response_breached_at
        ? (0, business_time_js_1.toDateTime)(cycle.response_breached_at, config.timezone).toUTC().toISO()
        : null;
    let responseBreachReason = cycle.response_breach_reason || null;
    let resolveBreached = Boolean(cycle.resolve_breached_at);
    let resolveBreachedAt = cycle.resolve_breached_at
        ? (0, business_time_js_1.toDateTime)(cycle.resolve_breached_at, config.timezone).toUTC().toISO()
        : null;
    let resolveBreachReason = cycle.resolve_breach_reason || null;
    let isEscalatedMidFlight = false;
    // 1. Response breach evaluation
    if (!responseBreached) {
        if (cycle.first_response_at) {
            // First response already happened
            const responseTime = (0, business_time_js_1.toDateTime)(cycle.first_response_at, config.timezone);
            if (responseTime > newDeadlines.responseDue) {
                responseBreached = true;
                responseBreachedAt = responseTime.toUTC().toISO();
                responseBreachReason = 'escalated_mid_flight';
                isEscalatedMidFlight = true;
            }
        }
        else {
            // First response has not happened yet
            if (now > newDeadlines.responseDue) {
                responseBreached = true;
                responseBreachedAt = nowIso;
                responseBreachReason = 'escalated_mid_flight';
                isEscalatedMidFlight = true;
            }
        }
    }
    // 2. Resolution breach evaluation
    if (!resolveBreached) {
        if (cycle.resolved_at) {
            const resolveTime = (0, business_time_js_1.toDateTime)(cycle.resolved_at, config.timezone);
            if (resolveTime > newDeadlines.resolveDue) {
                resolveBreached = true;
                resolveBreachedAt = resolveTime.toUTC().toISO();
                resolveBreachReason = 'escalated_mid_flight';
                isEscalatedMidFlight = true;
            }
        }
        else {
            if (now > newDeadlines.resolveDue) {
                resolveBreached = true;
                resolveBreachedAt = nowIso;
                resolveBreachReason = 'escalated_mid_flight';
                isEscalatedMidFlight = true;
            }
        }
    }
    return {
        newResponseDue: newDeadlines.responseDue,
        newResolveDue: newDeadlines.resolveDue,
        responseBreached,
        responseBreachedAt,
        responseBreachReason,
        resolveBreached,
        resolveBreachedAt,
        resolveBreachReason,
        isEscalatedMidFlight
    };
}
//# sourceMappingURL=deadlines.js.map