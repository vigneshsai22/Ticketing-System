"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const luxon_1 = require("luxon");
const business_time_js_1 = require("./business-time.js");
const deadlines_js_1 = require("./deadlines.js");
const sla_state_js_1 = require("./sla-state.js");
const TZ = 'Asia/Kolkata';
const urgentPolicy = {
    priority: 'urgent',
    respond_minutes: 120,
    resolve_minutes: 540,
    resolve_mode: 'end_of_response_day'
};
const mediumPolicy = {
    priority: 'medium',
    respond_minutes: 270,
    resolve_minutes: 1620,
    resolve_mode: 'fixed_minutes'
};
const lowPolicy = {
    priority: 'low',
    respond_minutes: 540,
    resolve_minutes: 2700,
    resolve_mode: 'fixed_minutes'
};
const zeroPolicy = {
    priority: 'urgent',
    respond_minutes: 0,
    resolve_minutes: 0,
    resolve_mode: 'fixed_minutes'
};
const sampleHolidays = [
    { date: '2026-08-15', name: 'Independence Day' }, // Saturday
    { date: '2026-10-02', name: 'Gandhi Jayanti' }, // Friday
    { date: '2026-10-26', name: 'Sample Monday Holiday' } // Monday
];
(0, vitest_1.describe)('packages/sla - SLA Engine & Business Time Suite', () => {
    // --------------------------------------------------------------------------
    // Core Working Time & Instant Checks
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('1. isWorkingTime: true during working hours Mon-Fri (10:00 Asia/Kolkata)', () => {
        // 2026-03-02 is a Monday
        const t = luxon_1.DateTime.fromISO('2026-03-02T10:00:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(true);
    });
    (0, vitest_1.it)('2. isWorkingTime: true at opening boundary 09:30:00', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T09:30:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(true);
    });
    (0, vitest_1.it)('3. isWorkingTime: true at 18:29:59 (last second before closing)', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T18:29:59.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(true);
    });
    (0, vitest_1.it)('4. isWorkingTime: false at closing boundary 18:30:00', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T18:30:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(false);
    });
    (0, vitest_1.it)('5. isWorkingTime: false before opening (09:29:59)', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T09:29:59.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(false);
    });
    (0, vitest_1.it)('6. isWorkingTime: false on a Saturday', () => {
        // 2026-03-07 is Saturday
        const t = luxon_1.DateTime.fromISO('2026-03-07T12:00:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(false);
    });
    (0, vitest_1.it)('7. isWorkingTime: false on a Sunday', () => {
        // 2026-03-08 is Sunday
        const t = luxon_1.DateTime.fromISO('2026-03-08T12:00:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t)).toBe(false);
    });
    (0, vitest_1.it)('8. isWorkingTime: false on an admin-managed holiday (Friday 2026-10-02)', () => {
        const t = luxon_1.DateTime.fromISO('2026-10-02T11:00:00.000', { zone: TZ });
        (0, vitest_1.expect)((0, business_time_js_1.isWorkingTime)(t, business_time_js_1.DEFAULT_WORKING_HOURS, sampleHolidays)).toBe(false);
    });
    (0, vitest_1.it)('9. nextWorkingInstant: returns same instant if already in working hours', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T14:15:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(t);
        (0, vitest_1.expect)(next.toISO()).toBe(t.toISO());
    });
    (0, vitest_1.it)('10. nextWorkingInstant: advances morning off-hours (07:30) to 09:30 same day', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T07:30:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(t);
        (0, vitest_1.expect)(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 09:30');
    });
    (0, vitest_1.it)('11. nextWorkingInstant: advances evening off-hours (20:00 Mon) to 09:30 Tuesday', () => {
        const t = luxon_1.DateTime.fromISO('2026-03-02T20:00:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(t);
        (0, vitest_1.expect)(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-03 09:30');
    });
    (0, vitest_1.it)('12. nextWorkingInstant: ticket arriving Saturday moves to Monday 09:30', () => {
        // 2026-03-07 is Saturday
        const t = luxon_1.DateTime.fromISO('2026-03-07T14:00:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(t);
        (0, vitest_1.expect)(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
    });
    (0, vitest_1.it)('13. nextWorkingInstant: ticket arriving Sunday moves to Monday 09:30', () => {
        // 2026-03-08 is Sunday
        const t = luxon_1.DateTime.fromISO('2026-03-08T10:00:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(t);
        (0, vitest_1.expect)(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
    });
    (0, vitest_1.it)('14. nextWorkingInstant: Monday holiday skips to Tuesday 09:30', () => {
        // 2026-10-26 is a Monday Holiday
        const sundayNight = luxon_1.DateTime.fromISO('2026-10-25T21:00:00.000', { zone: TZ });
        const next = (0, business_time_js_1.nextWorkingInstant)(sundayNight, business_time_js_1.DEFAULT_WORKING_HOURS, sampleHolidays);
        (0, vitest_1.expect)(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-10-27 09:30');
    });
    // --------------------------------------------------------------------------
    // Core Business Math & Required Golden Rules
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('15. GOLDEN RULE: Fri 18:00 urgent -> Mon 11:00 respond / Mon 18:30 resolve', () => {
        // Friday 2026-03-06 at 18:00
        const friEvening = luxon_1.DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
        const cycle = { clock_start: friEvening.toISO() };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, urgentPolicy);
        // Friday has 30 mins left (18:00 to 18:30). Remaining 90 mins carry to Monday 09:30 -> Mon 11:00
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 11:00');
        // Resolve is end of the working day containing response deadline -> Monday 18:30
        (0, vitest_1.expect)(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 18:30');
    });
    (0, vitest_1.it)('16. GOLDEN RULE: Sunday morning not breached for Friday 18:00 urgent ticket', () => {
        const friEvening = luxon_1.DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
        const sundayMorning = luxon_1.DateTime.fromISO('2026-03-08T11:00:00.000', { zone: TZ });
        const cycle = {
            clock_start: friEvening.toISO(),
            response_due: '2026-03-09T11:00:00.000+05:30',
            resolve_due: '2026-03-09T18:30:00.000+05:30'
        };
        const state = (0, sla_state_js_1.computeSlaState)(sundayMorning, cycle, urgentPolicy);
        // On Sunday morning, deadline is still Monday 11:00, so not breached
        (0, vitest_1.expect)(state.state).not.toBe('breached');
        (0, vitest_1.expect)(state.remainingBusinessMinutes).toBe(90); // 90 mins remaining (Mon 09:30 to 11:00)
        (0, vitest_1.expect)(state.overrunBusinessMinutes).toBe(0);
    });
    (0, vitest_1.it)('17. zero-minute policy: deadline equals next working instant', () => {
        const sat = luxon_1.DateTime.fromISO('2026-03-07T12:00:00.000', { zone: TZ });
        const cycle = { clock_start: sat.toISO() };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, zeroPolicy);
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
        (0, vitest_1.expect)(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
    });
    (0, vitest_1.it)('18. exactly-at-deadline boundary: not breached at due moment, breached 1 sec after', () => {
        const due = luxon_1.DateTime.fromISO('2026-03-02T11:00:00.000', { zone: TZ });
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: due.toISO(),
            resolve_due: '2026-03-02T18:30:00.000+05:30'
        };
        // Exactly at 11:00:00.000
        const atDeadline = (0, sla_state_js_1.computeSlaState)(due, cycle, urgentPolicy);
        (0, vitest_1.expect)(atDeadline.state).not.toBe('breached');
        (0, vitest_1.expect)(atDeadline.remainingBusinessMinutes).toBe(0);
        // 1 second after 11:00:01.000
        const afterDeadline = (0, sla_state_js_1.computeSlaState)(due.plus({ seconds: 1 }), cycle, urgentPolicy);
        (0, vitest_1.expect)(afterDeadline.state).toBe('breached');
    });
    // --------------------------------------------------------------------------
    // Pause Interval Scenarios
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('19. pause spanning a weekend: only working minutes are excluded', () => {
        // Ticket arrives Friday 16:30. Medium policy (respond: 270m = 4.5h)
        // Friday working time: 16:30 to 18:30 (120 mins).
        // Paused Friday 17:30 (after 60 mins work).
        // Resumed Monday 10:30 (after 60 mins of Monday working time).
        // Off-hours over weekend should not add extra business pause time.
        const start = luxon_1.DateTime.fromISO('2026-03-06T16:30:00.000', { zone: TZ });
        const pause = {
            startedAt: '2026-03-06T17:30:00.000+05:30', // Friday 17:30
            endedAt: '2026-03-09T10:30:00.000+05:30' // Monday 10:30
        };
        // Business pause duration:
        // Friday 17:30 to 18:30 = 60 mins.
        // Monday 09:30 to 10:30 = 60 mins. Total paused = 120 business mins.
        const cycle = { clock_start: start.toISO() };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, mediumPolicy, [pause]);
        // Unpaused 270 business mins from Fri 16:30:
        // Fri 16:30 to 17:30 = 60 mins worked. Remaining = 210 mins.
        // Resumed Mon 10:30: Mon 10:30 + 210 mins (3.5 hours) -> Mon 14:00!
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 14:00');
    });
    (0, vitest_1.it)('20. pause that starts off-hours: adds 0 business pause before working day', () => {
        // Ticket arrives Friday 18:00 (urgent: 120m).
        // Paused Saturday 14:00 (off-hours).
        // Resumed Monday 08:30 (still off-hours).
        // No working minutes elapsed during pause!
        const start = luxon_1.DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
        const pause = {
            startedAt: '2026-03-07T14:00:00.000+05:30',
            endedAt: '2026-03-09T08:30:00.000+05:30'
        };
        const cycle = { clock_start: start.toISO() };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, urgentPolicy, [pause]);
        // Should remain standard deadline: Monday 11:00
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 11:00');
    });
    (0, vitest_1.it)('21. pause then resume then breach', () => {
        // Monday 09:30 urgent (respond 120m -> due 11:30)
        const start = luxon_1.DateTime.fromISO('2026-03-02T09:30:00.000', { zone: TZ });
        // Paused at 10:00, resumed at 11:00 (60 business minutes pause)
        const pause = {
            startedAt: '2026-03-02T10:00:00.000+05:30',
            endedAt: '2026-03-02T11:00:00.000+05:30'
        };
        const cycle = {
            clock_start: start.toISO(),
            response_due: '2026-03-02T12:30:00.000+05:30', // elongated by 60 mins to 12:30
            resolve_due: '2026-03-02T18:30:00.000+05:30'
        };
        // At 12:00 -> state is on_track (30 mins remain)
        const at1200 = (0, sla_state_js_1.computeSlaState)('2026-03-02T12:00:00.000+05:30', cycle, urgentPolicy, [pause]);
        (0, vitest_1.expect)(at1200.state).toBe('on_track');
        (0, vitest_1.expect)(at1200.remainingBusinessMinutes).toBe(30);
        // At 12:45 -> state is breached (15 mins overrun)
        const at1245 = (0, sla_state_js_1.computeSlaState)('2026-03-02T12:45:00.000+05:30', cycle, urgentPolicy, [pause]);
        (0, vitest_1.expect)(at1245.state).toBe('breached');
        (0, vitest_1.expect)(at1245.overrunBusinessMinutes).toBe(15);
    });
    // --------------------------------------------------------------------------
    // Mid-Flight Priority Changes & Escalations
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('22. upgrade making it overdue: flags escalated_mid_flight and records breach', () => {
        // Ticket arrives Monday 09:30 as Low (respond: 540m -> due Tuesday 09:30).
        // At Monday 14:00 (4.5 hours = 270 business minutes elapsed), upgraded to Urgent (respond: 120m).
        // Under Urgent, response deadline from 09:30 was 11:30 Monday.
        // It is now 14:00 Monday -> instantly overdue!
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-03T09:30:00.000+05:30',
            resolve_due: '2026-03-09T09:30:00.000+05:30'
        };
        const now = '2026-03-02T14:00:00.000+05:30';
        const result = (0, deadlines_js_1.recomputeOnPriorityChange)(cycle, lowPolicy, urgentPolicy, [], now);
        (0, vitest_1.expect)(result.responseBreached).toBe(true);
        (0, vitest_1.expect)(result.responseBreachReason).toBe('escalated_mid_flight');
        (0, vitest_1.expect)(result.isEscalatedMidFlight).toBe(true);
        (0, vitest_1.expect)(result.newResponseDue.toFormat('HH:mm')).toBe('11:30');
        (0, vitest_1.expect)(result.newResolveDue.toFormat('HH:mm')).toBe('18:30');
    });
    (0, vitest_1.it)('23. downgrade not erasing a breach: previously breached response stays breached', () => {
        // Ticket was urgent and breached its response deadline at 12:00.
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            resolve_due: '2026-03-02T18:30:00.000+05:30',
            response_breached_at: '2026-03-02T11:30:01.000+05:30',
            response_breach_reason: 'unassigned_too_long'
        };
        // Downgraded to Low at 13:00 (under Low, 540m would be end of day 18:30, not breached)
        const now = '2026-03-02T13:00:00.000+05:30';
        const result = (0, deadlines_js_1.recomputeOnPriorityChange)(cycle, urgentPolicy, lowPolicy, [], now);
        // BREACH MUST NOT BE ERASED
        (0, vitest_1.expect)(result.responseBreached).toBe(true);
        (0, vitest_1.expect)(result.responseBreachedAt).toBe('2026-03-02T06:00:01.000Z'); // UTC
        (0, vitest_1.expect)(result.responseBreachReason).toBe('unassigned_too_long');
        // But deadlines are recalculated (under Low: 540m from 09:30 is Mon 18:30)
        (0, vitest_1.expect)(result.newResponseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 18:30');
    });
    // --------------------------------------------------------------------------
    // Multi-day & Policy SLA Calculations
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('24. medium policy: respond in 270m (half day), resolve in 1620m (3 days x 540m)', () => {
        const cycle = { clock_start: '2026-03-02T09:30:00.000+05:30' };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, mediumPolicy);
        // Mon 09:30 + 270m (4.5h) = Mon 14:00
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 14:00');
        // Mon 09:30 + 1620m (3 full 540m business days: Mon, Tue, Wed) = Wed 18:30
        (0, vitest_1.expect)(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-04 18:30');
    });
    (0, vitest_1.it)('25. low policy: respond in 540m (1 day), resolve in 2700m (5 days)', () => {
        const cycle = { clock_start: '2026-03-02T09:30:00.000+05:30' };
        const deadlines = (0, deadlines_js_1.computeDeadlines)(cycle, lowPolicy);
        // Mon 09:30 + 540m = Mon 18:30 (1 full 9h business day)
        (0, vitest_1.expect)(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 18:30');
        // Mon 09:30 + 2700m (5 full business days: Mon, Tue, Wed, Thu, Fri) = Fri 18:30
        (0, vitest_1.expect)(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-06 18:30');
    });
    (0, vitest_1.it)('26. businessMinutesBetween: computes exact business minutes within single day', () => {
        const a = '2026-03-02T10:00:00.000+05:30';
        const b = '2026-03-02T12:30:00.000+05:30';
        (0, vitest_1.expect)((0, business_time_js_1.businessMinutesBetween)(a, b)).toBe(150);
    });
    (0, vitest_1.it)('27. businessMinutesBetween: excludes weekend completely', () => {
        // Friday 18:00 to Monday 10:00
        // Fri: 18:00 to 18:30 = 30 mins
        // Sat & Sun: 0 mins
        // Mon: 09:30 to 10:00 = 30 mins -> Total 60 mins
        const a = '2026-03-06T18:00:00.000+05:30';
        const b = '2026-03-09T10:00:00.000+05:30';
        (0, vitest_1.expect)((0, business_time_js_1.businessMinutesBetween)(a, b)).toBe(60);
    });
    (0, vitest_1.it)('28. businessMinutesBetween: returns 0 when b <= a', () => {
        const a = '2026-03-02T12:00:00.000+05:30';
        const b = '2026-03-02T10:00:00.000+05:30';
        (0, vitest_1.expect)((0, business_time_js_1.businessMinutesBetween)(a, b)).toBe(0);
    });
    // --------------------------------------------------------------------------
    // SLA State & Progress Bar Thresholds
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('29. computeSlaState: returns at_risk when <= 20% business time remains', () => {
        // Medium policy: 270m respond total. 20% of 270m = 54 mins.
        // Due at 14:00. Current time 13:15 -> 45 mins left (16.6% < 20%) -> at_risk!
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T14:00:00.000+05:30',
            resolve_due: '2026-03-05T09:30:00.000+05:30'
        };
        const state = (0, sla_state_js_1.computeSlaState)('2026-03-02T13:15:00.000+05:30', cycle, mediumPolicy);
        (0, vitest_1.expect)(state.state).toBe('at_risk');
        (0, vitest_1.expect)(state.remainingBusinessMinutes).toBe(45);
        (0, vitest_1.expect)(state.percentRemaining).toBe(17);
    });
    (0, vitest_1.it)('30. computeSlaState: returns paused when actively waiting on customer', () => {
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            resolve_due: '2026-03-02T18:30:00.000+05:30'
        };
        const activePause = {
            startedAt: '2026-03-02T10:00:00.000+05:30',
            endedAt: null // open-ended active pause
        };
        const state = (0, sla_state_js_1.computeSlaState)('2026-03-02T10:30:00.000+05:30', cycle, urgentPolicy, [activePause]);
        (0, vitest_1.expect)(state.state).toBe('paused');
        (0, vitest_1.expect)(state.isPaused).toBe(true);
    });
    (0, vitest_1.it)('31. computeSlaState: switches to resolution target after first response', () => {
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            resolve_due: '2026-03-02T18:30:00.000+05:30',
            first_response_at: '2026-03-02T10:15:00.000+05:30' // responded on time
        };
        const state = (0, sla_state_js_1.computeSlaState)('2026-03-02T11:00:00.000+05:30', cycle, urgentPolicy);
        (0, vitest_1.expect)(state.targetType).toBe('resolution');
        // Resolution due 18:30. At 11:00 -> 7.5 hours = 450 business mins remain
        (0, vitest_1.expect)(state.remainingBusinessMinutes).toBe(450);
    });
    // --------------------------------------------------------------------------
    // Breach Reason Attribution
    // --------------------------------------------------------------------------
    (0, vitest_1.it)('32. computeBreachReason: classifies unassigned_too_long when waiting for assignment', () => {
        // Ticket urgent 120m due at 11:30. Assigned at 11:00 (spent 90m unassigned, only 30m with assignee)
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            response_breached_at: '2026-03-02T11:30:01.000+05:30'
        };
        const events = [
            { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
            { type: 'assigned', timestamp: '2026-03-02T11:00:00.000+05:30', actorId: 'agent-1' }
        ];
        const result = (0, sla_state_js_1.computeBreachReason)(events, cycle);
        (0, vitest_1.expect)(result.reason).toBe('unassigned_too_long');
        (0, vitest_1.expect)(result.supportingNumbers.unassignedMinutes).toBe(90);
        (0, vitest_1.expect)(result.supportingNumbers.timeWithAssigneeMinutes).toBe(30);
    });
    (0, vitest_1.it)('33. computeBreachReason: classifies slow_after_assignment when assigned quickly', () => {
        // Assigned at 09:40 (10m unassigned, 110m with assignee before breach at 11:30)
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            response_breached_at: '2026-03-02T11:30:01.000+05:30'
        };
        const events = [
            { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
            { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' }
        ];
        const result = (0, sla_state_js_1.computeBreachReason)(events, cycle);
        (0, vitest_1.expect)(result.reason).toBe('slow_after_assignment');
        (0, vitest_1.expect)(result.supportingNumbers.unassignedMinutes).toBe(10);
        (0, vitest_1.expect)(result.supportingNumbers.timeWithAssigneeMinutes).toBe(110);
    });
    (0, vitest_1.it)('34. computeBreachReason: classifies multiple_reassignments when reassigned >= 2 times', () => {
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T11:30:00.000+05:30',
            response_breached_at: '2026-03-02T11:30:01.000+05:30'
        };
        const events = [
            { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
            { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' },
            { type: 'reassigned', timestamp: '2026-03-02T10:10:00.000+05:30', actorId: 'agent-2' },
            { type: 'reassigned', timestamp: '2026-03-02T10:45:00.000+05:30', actorId: 'agent-3' }
        ];
        const result = (0, sla_state_js_1.computeBreachReason)(events, cycle);
        (0, vitest_1.expect)(result.reason).toBe('multiple_reassignments');
        (0, vitest_1.expect)(result.supportingNumbers.reassignmentCount).toBe(2);
    });
    (0, vitest_1.it)('35. computeBreachReason: supports total customer-wait minutes calculation', () => {
        const cycle = {
            clock_start: '2026-03-02T09:30:00.000+05:30',
            response_due: '2026-03-02T12:30:00.000+05:30',
            response_breached_at: '2026-03-02T12:30:01.000+05:30'
        };
        const pause = {
            startedAt: '2026-03-02T10:00:00.000+05:30',
            endedAt: '2026-03-02T11:00:00.000+05:30'
        };
        const events = [
            { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
            { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' }
        ];
        const result = (0, sla_state_js_1.computeBreachReason)(events, cycle, [pause]);
        (0, vitest_1.expect)(result.supportingNumbers.customerWaitMinutes).toBe(60);
    });
});
//# sourceMappingURL=sla.test.js.map