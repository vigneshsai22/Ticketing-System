import { DateTime } from 'luxon';
import { TicketPriority, SlaResolveMode } from '@frontdesk/shared';

export interface WorkingHoursConfig {
  start: string; // e.g. "09:30"
  end: string;   // e.g. "18:30"
  timezone: string; // e.g. "Asia/Kolkata"
  days: number[]; // 1 = Monday, 7 = Sunday (Luxon weekday standard: 1..7)
}

export interface SlaSettingsConfig {
  working_hours: WorkingHoursConfig;
  business_day_minutes: number; // 540
  auto_close_minutes: number;   // 2700
  reopen_window_days: number;   // 5
}

export interface HolidayInput {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export interface PauseInterval {
  startedAt: Date | DateTime | string;
  endedAt?: Date | DateTime | string | null;
  reason?: string | null;
}

export interface SlaPolicyInput {
  priority: TicketPriority;
  respond_minutes: number;
  resolve_minutes: number;
  resolve_mode: SlaResolveMode;
}

export interface TicketCycleInput {
  id?: string;
  ticket_id?: string;
  cycle_no?: number;
  clock_start: Date | DateTime | string;
  response_due?: Date | DateTime | string;
  resolve_due?: Date | DateTime | string;
  first_response_at?: Date | DateTime | string | null;
  resolved_at?: Date | DateTime | string | null;
  response_breached_at?: Date | DateTime | string | null;
  resolve_breached_at?: Date | DateTime | string | null;
  response_breach_reason?: string | null;
  resolve_breach_reason?: string | null;
}

export interface ComputedDeadlines {
  responseDue: DateTime;
  resolveDue: DateTime;
  clockStartNormalized: DateTime;
}

export interface RecomputeResult {
  newResponseDue: DateTime;
  newResolveDue: DateTime;
  responseBreached: boolean;
  responseBreachedAt: string | null;
  responseBreachReason: string | null;
  resolveBreached: boolean;
  resolveBreachedAt: string | null;
  resolveBreachReason: string | null;
  isEscalatedMidFlight: boolean;
}

export type SlaStatusState = 'on_track' | 'at_risk' | 'breached' | 'paused' | 'completed';

export interface SlaStateResult {
  state: SlaStatusState;
  targetType: 'response' | 'resolution' | 'none';
  targetDue: DateTime | null;
  remainingBusinessMinutes: number;
  overrunBusinessMinutes: number;
  percentRemaining: number;
  isPaused: boolean;
}

export type BreachReasonType =
  | 'unassigned_too_long'
  | 'slow_after_assignment'
  | 'escalated_mid_flight'
  | 'multiple_reassignments'
  | 'other';

export interface LifecycleEvent {
  type: 'created' | 'assigned' | 'reassigned' | 'priority_changed' | 'status_changed' | 'replied' | 'resolved';
  timestamp: Date | DateTime | string;
  actorId?: string | null;
  data?: Record<string, unknown>;
}

export interface BreachReasonResult {
  reason: BreachReasonType;
  supportingNumbers: {
    unassignedMinutes: number;
    timeWithAssigneeMinutes: number;
    reassignmentCount: number;
    customerWaitMinutes: number;
    totalAvailableMinutes: number;
  };
}
