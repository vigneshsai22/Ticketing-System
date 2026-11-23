import { DateTime } from 'luxon';
import { TicketCycleInput, SlaPolicyInput, PauseInterval, WorkingHoursConfig, HolidayInput, SlaStateResult, LifecycleEvent, BreachReasonResult } from './types.js';
/**
 * Computes current SLA progress, countdown state, and health status:
 * - on_track: > 20% business time remaining
 * - at_risk: <= 20% business time remaining
 * - breached: target deadline exceeded
 * - paused: currently in waiting_on_customer (active pause)
 * - completed: ticket cycle resolved
 */
export declare function computeSlaState(nowInput: Date | DateTime | string, cycle: TicketCycleInput, policy: SlaPolicyInput, pauses?: PauseInterval[], config?: WorkingHoursConfig, holidays?: HolidayInput[]): SlaStateResult;
/**
 * Diagnoses root cause for an SLA breach based on lifecycle audit events:
 * - unassigned_too_long: spent > 50% of available time waiting for assignment
 * - slow_after_assignment: spent majority of time assigned to an agent
 * - multiple_reassignments: reassigned >= 2 times
 * - escalated_mid_flight: priority upgrade caused retroactive deadline breach
 * - other: miscellaneous / uncategorized
 */
export declare function computeBreachReason(events: LifecycleEvent[], cycle: TicketCycleInput, pauses?: PauseInterval[], config?: WorkingHoursConfig, holidays?: HolidayInput[]): BreachReasonResult;
