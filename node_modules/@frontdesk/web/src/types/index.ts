export type UserRole = 'agent' | 'lead' | 'admin';
export type TicketPriority = 'urgent' | 'medium' | 'low';
export type TicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'resolved'
  | 'closed'
  | 'reopened';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface Ticket {
  id: string;
  human_id: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee_id: string | null;
  assignee_name?: string | null;
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  version: number;
  cycle_no: number;
  created_at: string;
  updated_at: string;
  clock_start?: string | null;
  response_due?: string | null;
  resolve_due?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  response_breached_at?: string | null;
  resolve_breached_at?: string | null;
  response_breach_reason?: string | null;
  resolve_breach_reason?: string | null;
}

export interface SlaPause {
  id: string;
  ticket_id: string;
  cycle_no: number;
  started_at: string;
  ended_at: string | null;
  paused_by?: string | null;
  reason?: string | null;
}

export interface TicketCycleDetails {
  id: string;
  ticket_id: string;
  cycle_no: number;
  clock_start: string;
  response_due: string;
  resolve_due: string;
  first_response_at: string | null;
  resolved_at: string | null;
  response_breached_at: string | null;
  resolve_breached_at: string | null;
  response_breach_reason: string | null;
  resolve_breach_reason: string | null;
  respond_minutes?: number;
  resolve_minutes?: number;
  resolve_mode?: 'fixed_minutes' | 'end_of_response_day';
}

export interface AuditLedgerEvent {
  id: string;
  seq: number;
  ticket_id: string;
  actor_type: 'agent' | 'customer' | 'system';
  actor_id: string | null;
  actor_name?: string | null;
  event_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface VerifyChainResult {
  valid: boolean;
  totalEvents: number;
  brokenAtSeq?: number;
  brokenEventId?: string;
  reason?: string;
  expectedHash?: string;
  actualHash?: string;
}

export interface PublicMessage {
  id: string;
  ticket_id: string;
  sender_type: 'agent' | 'customer' | 'system';
  sender_id: string;
  sender_name?: string;
  sender_email?: string;
  body: string;
  created_at: string;
}

export interface InternalNote {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  body: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  ticket_id: string;
  seq?: number;
  global_seq?: number;
  actor_type: 'agent' | 'customer' | 'system';
  actor_id: string | null;
  actor_name?: string | null;
  event_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface CannedReply {
  id: string;
  title: string;
  content: string;
  shortcut?: string | null;
  category?: string | null;
}

export interface TimeMachineBanner {
  active: boolean;
  message: string;
  formatted_time: string;
  label: string;
}

export interface TimeMachineState {
  current_time: string;
  offset_ms: number;
  frozen: boolean;
  is_shifted: boolean;
  banner: TimeMachineBanner;
}

export type TicketScope = 'my' | 'unassigned' | 'all';
export type TicketGroup = 'late' | 'at_risk' | 'waiting' | 'on_track';

export interface OutboxEmail {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  template: string | null;
  status: 'pending' | 'sent' | 'failed';
  error?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface CustomerVisibleEvent {
  id: string;
  ticket_id: string;
  event_type: 'message' | 'ticket_created' | 'ticket_reopened' | 'ticket_resolved' | 'ticket_closed';
  sender_type: 'customer' | 'agent' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface CustomerTicket {
  id: string;
  human_id: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  response_due?: string | null;
  resolve_due?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  can_reopen?: boolean;
}

// Lead Dashboard & Analytics Types
export interface LeadDashboardKpis {
  total_tickets: number;
  response_compliance_pct: number;
  resolution_compliance_pct: number;
  currently_late: number;
  at_risk: number;
  waiting_on_customer: number;
  unassigned: number;
}

export interface LateTicketItem {
  id: string;
  human_id: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee_id: string | null;
  assignee_name: string;
  customer_name: string;
  customer_org: string;
  created_at: string;
  response_due: string | null;
  resolve_due: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  response_breached: boolean;
  resolve_breached: boolean;
  why_late: string;
  why_late_label: string;
  customer_wait_minutes_excluded: number;
  cycle_no: number;
}

export interface LateOverTimePoint {
  date: string;
  count: number;
}

export interface BreachReasonBreakdown {
  reason: string;
  label: string;
  count: number;
  percentage: number;
}

export interface AgentWorkload {
  agent_id: string;
  agent_name: string;
  role: string;
  open_tickets: number;
  resolved_tickets: number;
  late_tickets: number;
}

export interface LeadDashboardData {
  kpis: LeadDashboardKpis;
  late_tickets: LateTicketItem[];
  charts: {
    late_over_time: LateOverTimePoint[];
    breach_reasons: BreachReasonBreakdown[];
    workload_per_agent: AgentWorkload[];
  };
}

// Admin Settings & Policy Types
export interface Holiday {
  id: string;
  date: string;
  name: string;
  created_at: string;
}

export interface SlaPolicy {
  id: string;
  priority: 'urgent' | 'medium' | 'low';
  respond_minutes: number;
  resolve_minutes: number;
  resolve_mode: 'fixed_minutes' | 'end_of_response_day';
}

export interface SystemSetting {
  key: string;
  value: unknown;
  description: string | null;
}


