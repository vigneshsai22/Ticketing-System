import { DateTime } from 'luxon';
import {
  TicketCycleInput,
  SlaPolicyInput,
  PauseInterval,
  WorkingHoursConfig,
  HolidayInput,
  SlaStateResult,
  LifecycleEvent,
  BreachReasonResult,
  BreachReasonType
} from './types.js';
import {
  DEFAULT_WORKING_HOURS,
  toDateTime,
  businessMinutesBetween
} from './business-time.js';

/**
 * Computes current SLA progress, countdown state, and health status:
 * - on_track: > 20% business time remaining
 * - at_risk: <= 20% business time remaining
 * - breached: target deadline exceeded
 * - paused: currently in waiting_on_customer (active pause)
 * - completed: ticket cycle resolved
 */
export function computeSlaState(
  nowInput: Date | DateTime | string,
  cycle: TicketCycleInput,
  policy: SlaPolicyInput,
  pauses: PauseInterval[] = [],
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): SlaStateResult {
  const now = toDateTime(nowInput, config.timezone);

  // 1. Check if actively paused
  const isPaused = pauses.some(p => {
    const pStart = toDateTime(p.startedAt, config.timezone);
    if (pStart > now) return false;
    if (!p.endedAt) return true; // open-ended pause
    const pEnd = toDateTime(p.endedAt, config.timezone);
    return pEnd > now;
  });

  // 2. Identify the active target
  let targetType: 'response' | 'resolution' | 'none' = 'none';
  let targetDue: DateTime | null = null;
  let totalBudget = 0;

  if (!cycle.first_response_at && cycle.response_due) {
    targetType = 'response';
    targetDue = toDateTime(cycle.response_due, config.timezone);
    totalBudget = policy.respond_minutes;
  } else if (!cycle.resolved_at && cycle.resolve_due) {
    targetType = 'resolution';
    targetDue = toDateTime(cycle.resolve_due, config.timezone);
    totalBudget = policy.resolve_minutes;
  }

  // If already resolved or no active target
  if (targetType === 'none' || !targetDue) {
    return {
      state: 'completed',
      targetType: 'none',
      targetDue: null,
      remainingBusinessMinutes: 0,
      overrunBusinessMinutes: 0,
      percentRemaining: 0,
      isPaused: false
    };
  }

  // 3. Compute remaining or overrun business minutes
  if (now > targetDue) {
    // Breached
    const overrun = businessMinutesBetween(targetDue, now, pauses, config, holidays);
    return {
      state: 'breached',
      targetType,
      targetDue,
      remainingBusinessMinutes: 0,
      overrunBusinessMinutes: overrun,
      percentRemaining: 0,
      isPaused
    };
  }

  const remaining = businessMinutesBetween(now, targetDue, pauses, config, holidays);
  const percent = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;

  let state: 'on_track' | 'at_risk' | 'paused' = 'on_track';
  if (isPaused) {
    state = 'paused';
  } else if (percent <= 20) {
    state = 'at_risk';
  }

  return {
    state,
    targetType,
    targetDue,
    remainingBusinessMinutes: remaining,
    overrunBusinessMinutes: 0,
    percentRemaining: Math.max(0, Math.min(100, Math.round(percent))),
    isPaused
  };
}

/**
 * Diagnoses root cause for an SLA breach based on lifecycle audit events:
 * - unassigned_too_long: spent > 50% of available time waiting for assignment
 * - slow_after_assignment: spent majority of time assigned to an agent
 * - multiple_reassignments: reassigned >= 2 times
 * - escalated_mid_flight: priority upgrade caused retroactive deadline breach
 * - other: miscellaneous / uncategorized
 */
export function computeBreachReason(
  events: LifecycleEvent[],
  cycle: TicketCycleInput,
  pauses: PauseInterval[] = [],
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): BreachReasonResult {
  const clockStart = toDateTime(cycle.clock_start, config.timezone);
  const breachTime = cycle.response_breached_at || cycle.resolve_breached_at;
  const deadlineInstant = breachTime
    ? toDateTime(breachTime, config.timezone)
    : (cycle.response_due ? toDateTime(cycle.response_due, config.timezone) : clockStart);

  // 1. Check for immediate escalation mid-flight
  const hasEscalation = events.some(e => {
    if (e.type !== 'priority_changed') return false;
    const eventTime = toDateTime(e.timestamp, config.timezone);
    return Math.abs(eventTime.diff(deadlineInstant, 'minutes').minutes) <= 5;
  });

  if (hasEscalation) {
    // Calculate customer wait minutes
    let customerWait = 0;
    for (const p of pauses) {
      const pStart = toDateTime(p.startedAt, config.timezone);
      const pEnd = p.endedAt ? toDateTime(p.endedAt, config.timezone) : deadlineInstant;
      customerWait += businessMinutesBetween(pStart, pEnd, [], config, holidays);
    }

    return {
      reason: 'escalated_mid_flight',
      supportingNumbers: {
        unassignedMinutes: 0,
        timeWithAssigneeMinutes: 0,
        reassignmentCount: 0,
        customerWaitMinutes: customerWait,
        totalAvailableMinutes: businessMinutesBetween(clockStart, deadlineInstant, pauses, config, holidays)
      }
    };
  }

  // 2. Count reassignments and calculate unassigned vs assigned duration
  let reassignmentCount = 0;
  let unassignedBusinessMinutes = 0;
  let timeWithAssigneeBusinessMinutes = 0;

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => {
    const tA = toDateTime(a.timestamp, config.timezone).toMillis();
    const tB = toDateTime(b.timestamp, config.timezone).toMillis();
    return tA - tB;
  });

  let currentAssignee: string | null = null;
  let lastStateChange = clockStart;

  for (const event of sortedEvents) {
    const eventTime = toDateTime(event.timestamp, config.timezone);
    if (eventTime > deadlineInstant) break;
    if (eventTime < lastStateChange) continue;

    const spanMinutes = businessMinutesBetween(lastStateChange, eventTime, pauses, config, holidays);

    if (currentAssignee === null) {
      unassignedBusinessMinutes += spanMinutes;
    } else {
      timeWithAssigneeBusinessMinutes += spanMinutes;
    }

    if (event.type === 'assigned') {
      const newAssignee = (event.actorId || event.data?.assigneeId || 'assigned') as string;
      if (currentAssignee !== null && currentAssignee !== newAssignee) {
        reassignmentCount++;
      }
      currentAssignee = newAssignee;
      lastStateChange = eventTime;
    } else if (event.type === 'reassigned') {
      reassignmentCount++;
      currentAssignee = (event.actorId || event.data?.assigneeId || 'reassigned') as string;
      lastStateChange = eventTime;
    }
  }

  // Trailing segment up to deadlineInstant
  if (deadlineInstant > lastStateChange) {
    const trailingSpan = businessMinutesBetween(lastStateChange, deadlineInstant, pauses, config, holidays);
    if (currentAssignee === null) {
      unassignedBusinessMinutes += trailingSpan;
    } else {
      timeWithAssigneeBusinessMinutes += trailingSpan;
    }
  }

  // Calculate customer wait minutes
  let customerWaitMinutes = 0;
  for (const p of pauses) {
    const pStart = toDateTime(p.startedAt, config.timezone);
    const pEnd = p.endedAt ? toDateTime(p.endedAt, config.timezone) : deadlineInstant;
    if (pStart < deadlineInstant) {
      const effectiveEnd = pEnd < deadlineInstant ? pEnd : deadlineInstant;
      customerWaitMinutes += businessMinutesBetween(pStart, effectiveEnd, [], config, holidays);
    }
  }

  const totalAvailableMinutes = unassignedBusinessMinutes + timeWithAssigneeBusinessMinutes;

  let reason: BreachReasonType = 'other';

  if (reassignmentCount >= 2) {
    reason = 'multiple_reassignments';
  } else if (unassignedBusinessMinutes > timeWithAssigneeBusinessMinutes) {
    reason = 'unassigned_too_long';
  } else if (timeWithAssigneeBusinessMinutes > 0) {
    reason = 'slow_after_assignment';
  }

  return {
    reason,
    supportingNumbers: {
      unassignedMinutes: unassignedBusinessMinutes,
      timeWithAssigneeMinutes: timeWithAssigneeBusinessMinutes,
      reassignmentCount,
      customerWaitMinutes,
      totalAvailableMinutes
    }
  };
}
