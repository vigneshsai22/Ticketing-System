import { DateTime } from 'luxon';
import {
  TicketCycleInput,
  SlaPolicyInput,
  PauseInterval,
  WorkingHoursConfig,
  HolidayInput,
  ComputedDeadlines,
  RecomputeResult
} from './types.js';
import {
  DEFAULT_WORKING_HOURS,
  toDateTime,
  nextWorkingInstant,
  addBusinessMinutes,
  businessMinutesBetween,
  getEndOfWorkingDay
} from './business-time.js';

/**
 * Computes response and resolution deadlines for a ticket cycle given an SLA policy
 * and any recorded pause intervals.
 *
 * Implements the special Urgent SLA rule:
 * "urgent: respond 120, resolve = end of the working day that contains the response deadline"
 */
export function computeDeadlines(
  cycle: TicketCycleInput,
  policy: SlaPolicyInput,
  pauses: PauseInterval[] = [],
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): ComputedDeadlines {
  const clockStartNormalized = nextWorkingInstant(cycle.clock_start, config, holidays);

  // 1. Response Deadline
  const responseDue = addBusinessMinutes(
    clockStartNormalized,
    policy.respond_minutes,
    pauses,
    config,
    holidays
  );

  // 2. Resolution Deadline
  let resolveDue: DateTime;

  if (policy.resolve_mode === 'end_of_response_day') {
    // For urgent: end of the working day containing the response deadline (18:30 Asia/Kolkata).
    // If pauses occurred between responseDue and the end of that day, elongate accordingly.
    const baseDayEnd = getEndOfWorkingDay(responseDue, config);
    if (baseDayEnd >= responseDue) {
      // Find remaining business minutes in that day from responseDue
      const remainingMinutesInDay = businessMinutesBetween(responseDue, baseDayEnd, [], config, holidays);
      resolveDue = addBusinessMinutes(responseDue, remainingMinutesInDay, pauses, config, holidays);
    } else {
      resolveDue = baseDayEnd;
    }
  } else {
    // Standard fixed minutes resolution SLA
    resolveDue = addBusinessMinutes(
      clockStartNormalized,
      policy.resolve_minutes,
      pauses,
      config,
      holidays
    );
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
export function recomputeOnPriorityChange(
  cycle: TicketCycleInput,
  oldPolicy: SlaPolicyInput,
  newPolicy: SlaPolicyInput,
  pauses: PauseInterval[] = [],
  nowInput: Date | DateTime | string,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): RecomputeResult {
  const now = toDateTime(nowInput, config.timezone);
  const nowIso = now.toUTC().toISO()!;

  // Compute new deadlines under new policy from the original clock start
  const newDeadlines = computeDeadlines(cycle, newPolicy, pauses, config, holidays);

  let responseBreached = Boolean(cycle.response_breached_at);
  let responseBreachedAt = cycle.response_breached_at
    ? toDateTime(cycle.response_breached_at, config.timezone).toUTC().toISO()
    : null;
  let responseBreachReason = cycle.response_breach_reason || null;

  let resolveBreached = Boolean(cycle.resolve_breached_at);
  let resolveBreachedAt = cycle.resolve_breached_at
    ? toDateTime(cycle.resolve_breached_at, config.timezone).toUTC().toISO()
    : null;
  let resolveBreachReason = cycle.resolve_breach_reason || null;

  let isEscalatedMidFlight = false;

  // 1. Response breach evaluation
  if (!responseBreached) {
    if (cycle.first_response_at) {
      // First response already happened
      const responseTime = toDateTime(cycle.first_response_at, config.timezone);
      if (responseTime > newDeadlines.responseDue) {
        responseBreached = true;
        responseBreachedAt = responseTime.toUTC().toISO();
        responseBreachReason = 'escalated_mid_flight';
        isEscalatedMidFlight = true;
      }
    } else {
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
      const resolveTime = toDateTime(cycle.resolved_at, config.timezone);
      if (resolveTime > newDeadlines.resolveDue) {
        resolveBreached = true;
        resolveBreachedAt = resolveTime.toUTC().toISO();
        resolveBreachReason = 'escalated_mid_flight';
        isEscalatedMidFlight = true;
      }
    } else {
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
