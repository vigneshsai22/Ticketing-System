import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  isWorkingTime,
  nextWorkingInstant,
  businessMinutesBetween,
  DEFAULT_WORKING_HOURS
} from './business-time.js';
import {
  computeDeadlines,
  recomputeOnPriorityChange
} from './deadlines.js';
import {
  computeSlaState,
  computeBreachReason
} from './sla-state.js';
import {
  SlaPolicyInput,
  TicketCycleInput,
  PauseInterval,
  HolidayInput,
  LifecycleEvent
} from './types.js';

const TZ = 'Asia/Kolkata';

const urgentPolicy: SlaPolicyInput = {
  priority: 'urgent',
  respond_minutes: 120,
  resolve_minutes: 540,
  resolve_mode: 'end_of_response_day'
};

const mediumPolicy: SlaPolicyInput = {
  priority: 'medium',
  respond_minutes: 270,
  resolve_minutes: 1620,
  resolve_mode: 'fixed_minutes'
};

const lowPolicy: SlaPolicyInput = {
  priority: 'low',
  respond_minutes: 540,
  resolve_minutes: 2700,
  resolve_mode: 'fixed_minutes'
};

const zeroPolicy: SlaPolicyInput = {
  priority: 'urgent',
  respond_minutes: 0,
  resolve_minutes: 0,
  resolve_mode: 'fixed_minutes'
};

const sampleHolidays: HolidayInput[] = [
  { date: '2026-08-15', name: 'Independence Day' }, // Saturday
  { date: '2026-10-02', name: 'Gandhi Jayanti' },    // Friday
  { date: '2026-10-26', name: 'Sample Monday Holiday' } // Monday
];

describe('packages/sla - SLA Engine & Business Time Suite', () => {

  // --------------------------------------------------------------------------
  // Core Working Time & Instant Checks
  // --------------------------------------------------------------------------

  it('1. isWorkingTime: true during working hours Mon-Fri (10:00 Asia/Kolkata)', () => {
    // 2026-03-02 is a Monday
    const t = DateTime.fromISO('2026-03-02T10:00:00.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(true);
  });

  it('2. isWorkingTime: true at opening boundary 09:30:00', () => {
    const t = DateTime.fromISO('2026-03-02T09:30:00.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(true);
  });

  it('3. isWorkingTime: true at 18:29:59 (last second before closing)', () => {
    const t = DateTime.fromISO('2026-03-02T18:29:59.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(true);
  });

  it('4. isWorkingTime: false at closing boundary 18:30:00', () => {
    const t = DateTime.fromISO('2026-03-02T18:30:00.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(false);
  });

  it('5. isWorkingTime: false before opening (09:29:59)', () => {
    const t = DateTime.fromISO('2026-03-02T09:29:59.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(false);
  });

  it('6. isWorkingTime: false on a Saturday', () => {
    // 2026-03-07 is Saturday
    const t = DateTime.fromISO('2026-03-07T12:00:00.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(false);
  });

  it('7. isWorkingTime: false on a Sunday', () => {
    // 2026-03-08 is Sunday
    const t = DateTime.fromISO('2026-03-08T12:00:00.000', { zone: TZ });
    expect(isWorkingTime(t)).toBe(false);
  });

  it('8. isWorkingTime: false on an admin-managed holiday (Friday 2026-10-02)', () => {
    const t = DateTime.fromISO('2026-10-02T11:00:00.000', { zone: TZ });
    expect(isWorkingTime(t, DEFAULT_WORKING_HOURS, sampleHolidays)).toBe(false);
  });

  it('9. nextWorkingInstant: returns same instant if already in working hours', () => {
    const t = DateTime.fromISO('2026-03-02T14:15:00.000', { zone: TZ });
    const next = nextWorkingInstant(t);
    expect(next.toISO()).toBe(t.toISO());
  });

  it('10. nextWorkingInstant: advances morning off-hours (07:30) to 09:30 same day', () => {
    const t = DateTime.fromISO('2026-03-02T07:30:00.000', { zone: TZ });
    const next = nextWorkingInstant(t);
    expect(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 09:30');
  });

  it('11. nextWorkingInstant: advances evening off-hours (20:00 Mon) to 09:30 Tuesday', () => {
    const t = DateTime.fromISO('2026-03-02T20:00:00.000', { zone: TZ });
    const next = nextWorkingInstant(t);
    expect(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-03 09:30');
  });

  it('12. nextWorkingInstant: ticket arriving Saturday moves to Monday 09:30', () => {
    // 2026-03-07 is Saturday
    const t = DateTime.fromISO('2026-03-07T14:00:00.000', { zone: TZ });
    const next = nextWorkingInstant(t);
    expect(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
  });

  it('13. nextWorkingInstant: ticket arriving Sunday moves to Monday 09:30', () => {
    // 2026-03-08 is Sunday
    const t = DateTime.fromISO('2026-03-08T10:00:00.000', { zone: TZ });
    const next = nextWorkingInstant(t);
    expect(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
  });

  it('14. nextWorkingInstant: Monday holiday skips to Tuesday 09:30', () => {
    // 2026-10-26 is a Monday Holiday
    const sundayNight = DateTime.fromISO('2026-10-25T21:00:00.000', { zone: TZ });
    const next = nextWorkingInstant(sundayNight, DEFAULT_WORKING_HOURS, sampleHolidays);
    expect(next.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-10-27 09:30');
  });

  // --------------------------------------------------------------------------
  // Core Business Math & Required Golden Rules
  // --------------------------------------------------------------------------

  it('15. GOLDEN RULE: Fri 18:00 urgent -> Mon 11:00 respond / Mon 18:30 resolve', () => {
    // Friday 2026-03-06 at 18:00
    const friEvening = DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
    const cycle: TicketCycleInput = { clock_start: friEvening.toISO()! };

    const deadlines = computeDeadlines(cycle, urgentPolicy);

    // Friday has 30 mins left (18:00 to 18:30). Remaining 90 mins carry to Monday 09:30 -> Mon 11:00
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 11:00');
    // Resolve is end of the working day containing response deadline -> Monday 18:30
    expect(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 18:30');
  });

  it('16. GOLDEN RULE: Sunday morning not breached for Friday 18:00 urgent ticket', () => {
    const friEvening = DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
    const sundayMorning = DateTime.fromISO('2026-03-08T11:00:00.000', { zone: TZ });
    const cycle: TicketCycleInput = {
      clock_start: friEvening.toISO()!,
      response_due: '2026-03-09T11:00:00.000+05:30',
      resolve_due: '2026-03-09T18:30:00.000+05:30'
    };

    const state = computeSlaState(sundayMorning, cycle, urgentPolicy);
    // On Sunday morning, deadline is still Monday 11:00, so not breached
    expect(state.state).not.toBe('breached');
    expect(state.remainingBusinessMinutes).toBe(90); // 90 mins remaining (Mon 09:30 to 11:00)
    expect(state.overrunBusinessMinutes).toBe(0);
  });

  it('17. zero-minute policy: deadline equals next working instant', () => {
    const sat = DateTime.fromISO('2026-03-07T12:00:00.000', { zone: TZ });
    const cycle: TicketCycleInput = { clock_start: sat.toISO()! };

    const deadlines = computeDeadlines(cycle, zeroPolicy);
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
    expect(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 09:30');
  });

  it('18. exactly-at-deadline boundary: not breached at due moment, breached 1 sec after', () => {
    const due = DateTime.fromISO('2026-03-02T11:00:00.000', { zone: TZ });
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: due.toISO()!,
      resolve_due: '2026-03-02T18:30:00.000+05:30'
    };

    // Exactly at 11:00:00.000
    const atDeadline = computeSlaState(due, cycle, urgentPolicy);
    expect(atDeadline.state).not.toBe('breached');
    expect(atDeadline.remainingBusinessMinutes).toBe(0);

    // 1 second after 11:00:01.000
    const afterDeadline = computeSlaState(due.plus({ seconds: 1 }), cycle, urgentPolicy);
    expect(afterDeadline.state).toBe('breached');
  });

  // --------------------------------------------------------------------------
  // Pause Interval Scenarios
  // --------------------------------------------------------------------------

  it('19. pause spanning a weekend: only working minutes are excluded', () => {
    // Ticket arrives Friday 16:30. Medium policy (respond: 270m = 4.5h)
    // Friday working time: 16:30 to 18:30 (120 mins).
    // Paused Friday 17:30 (after 60 mins work).
    // Resumed Monday 10:30 (after 60 mins of Monday working time).
    // Off-hours over weekend should not add extra business pause time.
    const start = DateTime.fromISO('2026-03-06T16:30:00.000', { zone: TZ });
    const pause: PauseInterval = {
      startedAt: '2026-03-06T17:30:00.000+05:30', // Friday 17:30
      endedAt: '2026-03-09T10:30:00.000+05:30'   // Monday 10:30
    };
    // Business pause duration:
    // Friday 17:30 to 18:30 = 60 mins.
    // Monday 09:30 to 10:30 = 60 mins. Total paused = 120 business mins.

    const cycle: TicketCycleInput = { clock_start: start.toISO()! };
    const deadlines = computeDeadlines(cycle, mediumPolicy, [pause]);

    // Unpaused 270 business mins from Fri 16:30:
    // Fri 16:30 to 17:30 = 60 mins worked. Remaining = 210 mins.
    // Resumed Mon 10:30: Mon 10:30 + 210 mins (3.5 hours) -> Mon 14:00!
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 14:00');
  });

  it('20. pause that starts off-hours: adds 0 business pause before working day', () => {
    // Ticket arrives Friday 18:00 (urgent: 120m).
    // Paused Saturday 14:00 (off-hours).
    // Resumed Monday 08:30 (still off-hours).
    // No working minutes elapsed during pause!
    const start = DateTime.fromISO('2026-03-06T18:00:00.000', { zone: TZ });
    const pause: PauseInterval = {
      startedAt: '2026-03-07T14:00:00.000+05:30',
      endedAt: '2026-03-09T08:30:00.000+05:30'
    };

    const cycle: TicketCycleInput = { clock_start: start.toISO()! };
    const deadlines = computeDeadlines(cycle, urgentPolicy, [pause]);

    // Should remain standard deadline: Monday 11:00
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-09 11:00');
  });

  it('21. pause then resume then breach', () => {
    // Monday 09:30 urgent (respond 120m -> due 11:30)
    const start = DateTime.fromISO('2026-03-02T09:30:00.000', { zone: TZ });
    // Paused at 10:00, resumed at 11:00 (60 business minutes pause)
    const pause: PauseInterval = {
      startedAt: '2026-03-02T10:00:00.000+05:30',
      endedAt: '2026-03-02T11:00:00.000+05:30'
    };

    const cycle: TicketCycleInput = {
      clock_start: start.toISO()!,
      response_due: '2026-03-02T12:30:00.000+05:30', // elongated by 60 mins to 12:30
      resolve_due: '2026-03-02T18:30:00.000+05:30'
    };

    // At 12:00 -> state is on_track (30 mins remain)
    const at1200 = computeSlaState('2026-03-02T12:00:00.000+05:30', cycle, urgentPolicy, [pause]);
    expect(at1200.state).toBe('on_track');
    expect(at1200.remainingBusinessMinutes).toBe(30);

    // At 12:45 -> state is breached (15 mins overrun)
    const at1245 = computeSlaState('2026-03-02T12:45:00.000+05:30', cycle, urgentPolicy, [pause]);
    expect(at1245.state).toBe('breached');
    expect(at1245.overrunBusinessMinutes).toBe(15);
  });

  // --------------------------------------------------------------------------
  // Mid-Flight Priority Changes & Escalations
  // --------------------------------------------------------------------------

  it('22. upgrade making it overdue: flags escalated_mid_flight and records breach', () => {
    // Ticket arrives Monday 09:30 as Low (respond: 540m -> due Tuesday 09:30).
    // At Monday 14:00 (4.5 hours = 270 business minutes elapsed), upgraded to Urgent (respond: 120m).
    // Under Urgent, response deadline from 09:30 was 11:30 Monday.
    // It is now 14:00 Monday -> instantly overdue!
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-03T09:30:00.000+05:30',
      resolve_due: '2026-03-09T09:30:00.000+05:30'
    };

    const now = '2026-03-02T14:00:00.000+05:30';
    const result = recomputeOnPriorityChange(cycle, lowPolicy, urgentPolicy, [], now);

    expect(result.responseBreached).toBe(true);
    expect(result.responseBreachReason).toBe('escalated_mid_flight');
    expect(result.isEscalatedMidFlight).toBe(true);
    expect(result.newResponseDue.toFormat('HH:mm')).toBe('11:30');
    expect(result.newResolveDue.toFormat('HH:mm')).toBe('18:30');
  });

  it('23. downgrade not erasing a breach: previously breached response stays breached', () => {
    // Ticket was urgent and breached its response deadline at 12:00.
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      resolve_due: '2026-03-02T18:30:00.000+05:30',
      response_breached_at: '2026-03-02T11:30:01.000+05:30',
      response_breach_reason: 'unassigned_too_long'
    };

    // Downgraded to Low at 13:00 (under Low, 540m would be end of day 18:30, not breached)
    const now = '2026-03-02T13:00:00.000+05:30';
    const result = recomputeOnPriorityChange(cycle, urgentPolicy, lowPolicy, [], now);

    // BREACH MUST NOT BE ERASED
    expect(result.responseBreached).toBe(true);
    expect(result.responseBreachedAt).toBe('2026-03-02T06:00:01.000Z'); // UTC
    expect(result.responseBreachReason).toBe('unassigned_too_long');
    // But deadlines are recalculated (under Low: 540m from 09:30 is Mon 18:30)
    expect(result.newResponseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 18:30');
  });

  // --------------------------------------------------------------------------
  // Multi-day & Policy SLA Calculations
  // --------------------------------------------------------------------------

  it('24. medium policy: respond in 270m (half day), resolve in 1620m (3 days x 540m)', () => {
    const cycle: TicketCycleInput = { clock_start: '2026-03-02T09:30:00.000+05:30' };
    const deadlines = computeDeadlines(cycle, mediumPolicy);

    // Mon 09:30 + 270m (4.5h) = Mon 14:00
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 14:00');
    // Mon 09:30 + 1620m (3 full 540m business days: Mon, Tue, Wed) = Wed 18:30
    expect(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-04 18:30');
  });

  it('25. low policy: respond in 540m (1 day), resolve in 2700m (5 days)', () => {
    const cycle: TicketCycleInput = { clock_start: '2026-03-02T09:30:00.000+05:30' };
    const deadlines = computeDeadlines(cycle, lowPolicy);

    // Mon 09:30 + 540m = Mon 18:30 (1 full 9h business day)
    expect(deadlines.responseDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-02 18:30');
    // Mon 09:30 + 2700m (5 full business days: Mon, Tue, Wed, Thu, Fri) = Fri 18:30
    expect(deadlines.resolveDue.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-06 18:30');
  });

  it('26. businessMinutesBetween: computes exact business minutes within single day', () => {
    const a = '2026-03-02T10:00:00.000+05:30';
    const b = '2026-03-02T12:30:00.000+05:30';
    expect(businessMinutesBetween(a, b)).toBe(150);
  });

  it('27. businessMinutesBetween: excludes weekend completely', () => {
    // Friday 18:00 to Monday 10:00
    // Fri: 18:00 to 18:30 = 30 mins
    // Sat & Sun: 0 mins
    // Mon: 09:30 to 10:00 = 30 mins -> Total 60 mins
    const a = '2026-03-06T18:00:00.000+05:30';
    const b = '2026-03-09T10:00:00.000+05:30';
    expect(businessMinutesBetween(a, b)).toBe(60);
  });

  it('28. businessMinutesBetween: returns 0 when b <= a', () => {
    const a = '2026-03-02T12:00:00.000+05:30';
    const b = '2026-03-02T10:00:00.000+05:30';
    expect(businessMinutesBetween(a, b)).toBe(0);
  });

  // --------------------------------------------------------------------------
  // SLA State & Progress Bar Thresholds
  // --------------------------------------------------------------------------

  it('29. computeSlaState: returns at_risk when <= 20% business time remains', () => {
    // Medium policy: 270m respond total. 20% of 270m = 54 mins.
    // Due at 14:00. Current time 13:15 -> 45 mins left (16.6% < 20%) -> at_risk!
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T14:00:00.000+05:30',
      resolve_due: '2026-03-05T09:30:00.000+05:30'
    };

    const state = computeSlaState('2026-03-02T13:15:00.000+05:30', cycle, mediumPolicy);
    expect(state.state).toBe('at_risk');
    expect(state.remainingBusinessMinutes).toBe(45);
    expect(state.percentRemaining).toBe(17);
  });

  it('30. computeSlaState: returns paused when actively waiting on customer', () => {
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      resolve_due: '2026-03-02T18:30:00.000+05:30'
    };

    const activePause: PauseInterval = {
      startedAt: '2026-03-02T10:00:00.000+05:30',
      endedAt: null // open-ended active pause
    };

    const state = computeSlaState('2026-03-02T10:30:00.000+05:30', cycle, urgentPolicy, [activePause]);
    expect(state.state).toBe('paused');
    expect(state.isPaused).toBe(true);
  });

  it('31. computeSlaState: switches to resolution target after first response', () => {
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      resolve_due: '2026-03-02T18:30:00.000+05:30',
      first_response_at: '2026-03-02T10:15:00.000+05:30' // responded on time
    };

    const state = computeSlaState('2026-03-02T11:00:00.000+05:30', cycle, urgentPolicy);
    expect(state.targetType).toBe('resolution');
    // Resolution due 18:30. At 11:00 -> 7.5 hours = 450 business mins remain
    expect(state.remainingBusinessMinutes).toBe(450);
  });

  // --------------------------------------------------------------------------
  // Breach Reason Attribution
  // --------------------------------------------------------------------------

  it('32. computeBreachReason: classifies unassigned_too_long when waiting for assignment', () => {
    // Ticket urgent 120m due at 11:30. Assigned at 11:00 (spent 90m unassigned, only 30m with assignee)
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      response_breached_at: '2026-03-02T11:30:01.000+05:30'
    };

    const events: LifecycleEvent[] = [
      { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
      { type: 'assigned', timestamp: '2026-03-02T11:00:00.000+05:30', actorId: 'agent-1' }
    ];

    const result = computeBreachReason(events, cycle);
    expect(result.reason).toBe('unassigned_too_long');
    expect(result.supportingNumbers.unassignedMinutes).toBe(90);
    expect(result.supportingNumbers.timeWithAssigneeMinutes).toBe(30);
  });

  it('33. computeBreachReason: classifies slow_after_assignment when assigned quickly', () => {
    // Assigned at 09:40 (10m unassigned, 110m with assignee before breach at 11:30)
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      response_breached_at: '2026-03-02T11:30:01.000+05:30'
    };

    const events: LifecycleEvent[] = [
      { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
      { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' }
    ];

    const result = computeBreachReason(events, cycle);
    expect(result.reason).toBe('slow_after_assignment');
    expect(result.supportingNumbers.unassignedMinutes).toBe(10);
    expect(result.supportingNumbers.timeWithAssigneeMinutes).toBe(110);
  });

  it('34. computeBreachReason: classifies multiple_reassignments when reassigned >= 2 times', () => {
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T11:30:00.000+05:30',
      response_breached_at: '2026-03-02T11:30:01.000+05:30'
    };

    const events: LifecycleEvent[] = [
      { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
      { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' },
      { type: 'reassigned', timestamp: '2026-03-02T10:10:00.000+05:30', actorId: 'agent-2' },
      { type: 'reassigned', timestamp: '2026-03-02T10:45:00.000+05:30', actorId: 'agent-3' }
    ];

    const result = computeBreachReason(events, cycle);
    expect(result.reason).toBe('multiple_reassignments');
    expect(result.supportingNumbers.reassignmentCount).toBe(2);
  });

  it('35. computeBreachReason: supports total customer-wait minutes calculation', () => {
    const cycle: TicketCycleInput = {
      clock_start: '2026-03-02T09:30:00.000+05:30',
      response_due: '2026-03-02T12:30:00.000+05:30',
      response_breached_at: '2026-03-02T12:30:01.000+05:30'
    };

    const pause: PauseInterval = {
      startedAt: '2026-03-02T10:00:00.000+05:30',
      endedAt: '2026-03-02T11:00:00.000+05:30'
    };

    const events: LifecycleEvent[] = [
      { type: 'created', timestamp: '2026-03-02T09:30:00.000+05:30' },
      { type: 'assigned', timestamp: '2026-03-02T09:40:00.000+05:30', actorId: 'agent-1' }
    ];

    const result = computeBreachReason(events, cycle, [pause]);
    expect(result.supportingNumbers.customerWaitMinutes).toBe(60);
  });
});
