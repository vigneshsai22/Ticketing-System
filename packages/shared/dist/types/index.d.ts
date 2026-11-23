export type UserRole = 'agent' | 'lead' | 'admin';
export type TicketPriority = 'urgent' | 'medium' | 'low';
export type TicketStatus = 'new' | 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed' | 'reopened';
export type SlaResolveMode = 'fixed_minutes' | 'end_of_response_day';
export type ActorType = 'agent' | 'customer' | 'system';
export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    active: boolean;
    created_at: string;
}
export interface Customer {
    id: string;
    email: string;
    name: string;
    organization?: string;
    created_at: string;
}
export interface Ticket {
    id: string;
    human_id: string;
    subject: string;
    priority: TicketPriority;
    status: TicketStatus;
    assignee_id?: string | null;
    version: number;
    cycle_no: number;
    parent_ticket_id?: string | null;
    customer_id: string;
    created_at: string;
    updated_at: string;
}
export interface TicketCycle {
    id: string;
    ticket_id: string;
    cycle_no: number;
    clock_start: string;
    response_due: string;
    resolve_due: string;
    first_response_at?: string | null;
    resolved_at?: string | null;
    response_breached_at?: string | null;
    resolve_breached_at?: string | null;
    response_breach_reason?: string | null;
    resolve_breach_reason?: string | null;
    created_at: string;
    updated_at: string;
}
export interface SlaPolicy {
    id: string;
    priority: TicketPriority;
    respond_minutes: number;
    resolve_minutes: number;
    resolve_mode: SlaResolveMode;
}
export interface SystemSettings {
    business_day_minutes: number;
    auto_close_minutes: number;
    reopen_window_days: number;
    working_hours: {
        start: string;
        end: string;
        timezone: string;
        days: number[];
    };
}
export interface Holiday {
    id: string;
    date: string;
    name: string;
    created_at: string;
}
export interface SlaPause {
    id: string;
    ticket_id: string;
    cycle_no: number;
    started_at: string;
    ended_at?: string | null;
    paused_by?: string | null;
    reason?: string | null;
    created_at: string;
}
export interface PublicMessage {
    id: string;
    ticket_id: string;
    sender_type: ActorType;
    sender_id: string;
    body: string;
    idempotency_key?: string | null;
    created_at: string;
}
export interface InternalNote {
    id: string;
    ticket_id: string;
    author_id: string;
    body: string;
    created_at: string;
}
export interface AuditEvent {
    id: string;
    seq: number;
    ticket_id?: string | null;
    actor_type: ActorType;
    actor_id?: string | null;
    event_type: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    prev_hash?: string | null;
    hash: string;
    created_at: string;
}
export interface MagicLink {
    id: string;
    token_hash: string;
    customer_id?: string | null;
    ticket_id?: string | null;
    expires_at: string;
    used_at?: string | null;
    created_at: string;
}
export interface CannedReply {
    id: string;
    title: string;
    content: string;
    shortcut?: string | null;
    category?: string | null;
    created_at: string;
}
export interface OutboxEmail {
    id: string;
    recipient_email: string;
    subject: string;
    body: string;
    template?: string | null;
    status: 'pending' | 'sent' | 'failed';
    error?: string | null;
    sent_at?: string | null;
    created_at: string;
}
