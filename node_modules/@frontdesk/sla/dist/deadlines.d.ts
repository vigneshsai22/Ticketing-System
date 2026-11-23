import { DateTime } from 'luxon';
import { TicketCycleInput, SlaPolicyInput, PauseInterval, WorkingHoursConfig, HolidayInput, ComputedDeadlines, RecomputeResult } from './types.js';
/**
 * Computes response and resolution deadlines for a ticket cycle given an SLA policy
 * and any recorded pause intervals.
 *
 * Implements the special Urgent SLA rule:
 * "urgent: respond 120, resolve = end of the working day that contains the response deadline"
 */
export declare function computeDeadlines(cycle: TicketCycleInput, policy: SlaPolicyInput, pauses?: PauseInterval[], config?: WorkingHoursConfig, holidays?: HolidayInput[]): ComputedDeadlines;
/**
 * Recomputes deadlines on mid-ticket priority change from the original clock start
 * excluding paused time.
 *
 * Rules:
 * - Breaches already recorded are NEVER erased (even if downgraded).
 * - If an upgrade causes a deadline to retroactively fall in the past,
 *   record breach reason "escalated_mid_flight".
 */
export declare function recomputeOnPriorityChange(cycle: TicketCycleInput, oldPolicy: SlaPolicyInput, newPolicy: SlaPolicyInput, pauses: PauseInterval[] | undefined, nowInput: Date | DateTime | string, config?: WorkingHoursConfig, holidays?: HolidayInput[]): RecomputeResult;
