import {
  User,
  Ticket,
  PublicMessage,
  InternalNote,
  AuditEvent,
  CannedReply,
  TimeMachineState,
  OutboxEmail,
  CustomerVisibleEvent,
  CustomerTicket,
  LeadDashboardData,
  Holiday,
  SlaPolicy,
  SystemSetting,
  SlaPause,
  TicketCycleDetails,
  AuditLedgerEvent,
  VerifyChainResult
} from '../types/index.js';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include' // Send auth cookies
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error: string }).error
      : `HTTP ${response.status} Error`;
    throw new ApiError(response.status, errorMsg, data);
  }

  return data as T;
}

export const api = {
  // Auth
  async demoLogin(email: string): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/auth/me');
  },

  async getStaff(): Promise<{ users: User[] }> {
    return request<{ users: User[] }>('/admin/users');
  },

  // Tickets
  async getTickets(params: { status?: string; priority?: string; assignee?: string } = {}): Promise<{ tickets: Ticket[] }> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.assignee) query.set('assignee', params.assignee);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{ tickets: Ticket[] }>(`/tickets${qs}`);
  },

  async getTicket(id: string): Promise<{ ticket: Ticket }> {
    return request<{ ticket: Ticket }>(`/tickets/${id}`);
  },

  async getThread(id: string): Promise<{
    public_messages: PublicMessage[];
    internal_notes: InternalNote[];
    audit_events: AuditEvent[];
    pauses?: SlaPause[];
    cycle?: TicketCycleDetails | null;
  }> {
    return request<{
      public_messages: PublicMessage[];
      internal_notes: InternalNote[];
      audit_events: AuditEvent[];
      pauses?: SlaPause[];
      cycle?: TicketCycleDetails | null;
    }>(`/tickets/${id}/thread`);
  },

  async getTicketAudit(ticketId: string): Promise<{ events: AuditLedgerEvent[] }> {
    return request<{ events: AuditLedgerEvent[] }>(`/tickets/${ticketId}/audit`);
  },

  async verifyTicketAudit(ticketId: string): Promise<VerifyChainResult> {
    return request<VerifyChainResult>(`/tickets/${ticketId}/audit/verify`);
  },

  async getCustomerPreview(id: string): Promise<{
    events: Array<{
      id: string;
      event_type: string;
      content: string;
      sender_type: string;
      created_at: string;
    }>;
  }> {
    return request<{
      events: Array<{
        id: string;
        event_type: string;
        content: string;
        sender_type: string;
        created_at: string;
      }>;
    }>(`/tickets/${id}/customer-preview`);
  },

  async claimTicket(id: string, version: number): Promise<{ ticket: Ticket }> {
    return request<{ ticket: Ticket }>(`/tickets/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ version })
    });
  },

  async releaseTicket(id: string, version: number): Promise<{ ticket: Ticket }> {
    return request<{ ticket: Ticket }>(`/tickets/${id}/release`, {
      method: 'POST',
      body: JSON.stringify({ version })
    });
  },

  async reassignTicket(id: string, assigneeId: string, version: number): Promise<{ ticket: Ticket }> {
    return request<{ ticket: Ticket }>(`/tickets/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ assignee_id: assigneeId, version })
    });
  },

  async changePriority(id: string, priority: string, reason: string, version: number): Promise<{ ticket: Ticket }> {
    return request<{ ticket: Ticket }>(`/tickets/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority, reason, version })
    });
  },

  async postPublicReply(id: string, body: string, waitOnCustomer: boolean, idempotencyKey: string): Promise<{ message: PublicMessage }> {
    return request<{ message: PublicMessage }>(`/tickets/${id}/reply`, {
      method: 'POST',
      headers: {
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({ body, wait_on_customer: waitOnCustomer })
    });
  },

  async postInternalNote(id: string, body: string): Promise<{ note: InternalNote }> {
    return request<{ note: InternalNote }>(`/tickets/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  },

  // Canned Replies
  async getCannedReplies(): Promise<{ replies: CannedReply[] }> {
    return request<{ replies: CannedReply[] }>('/canned-replies');
  },

  // Time Machine
  async getTime(): Promise<TimeMachineState> {
    return request<TimeMachineState>('/demo/time');
  },

  async jumpTime(target: string): Promise<TimeMachineState> {
    return request<TimeMachineState>('/demo/time/jump', {
      method: 'POST',
      body: JSON.stringify({ target })
    });
  },

  async shiftTime(params: { minutes?: number; hours?: number; days?: number }): Promise<TimeMachineState> {
    return request<TimeMachineState>('/demo/time/shift', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async resetTime(): Promise<TimeMachineState> {
    return request<TimeMachineState>('/demo/time/reset', {
      method: 'POST'
    });
  },

  async runScheduler(): Promise<{ success: boolean; summary: unknown }> {
    return request<{ success: boolean; summary: unknown }>('/scheduler/run', {
      method: 'POST'
    });
  },

  // Presence
  async sendPresence(ticketId: string): Promise<void> {
    try {
      await request('/events/presence', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: ticketId })
      });
    } catch {
      // presence is best-effort
    }
  },

  // Outbox / Simulated Emails (Admin/Lead)
  async getOutbox(recipient?: string): Promise<{ outbox: OutboxEmail[] }> {
    const qs = recipient ? `?recipient=${encodeURIComponent(recipient)}` : '';
    return request<{ outbox: OutboxEmail[] }>(`/admin/outbox${qs}`);
  },

  // Customer Portal (Magic Link Auth)
  async createCustomerTicket(payload: {
    email: string;
    name: string;
    subject: string;
    priority: string;
    message: string;
  }): Promise<{ success: boolean; ticket: CustomerTicket; token: string; magic_link_url: string }> {
    return request<{ success: boolean; ticket: CustomerTicket; token: string; magic_link_url: string }>('/customer/tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getCustomerTicket(id: string, token: string): Promise<{ ticket: CustomerTicket }> {
    return request<{ ticket: CustomerTicket }>(`/customer/tickets/${id}?token=${encodeURIComponent(token)}`);
  },

  async getCustomerThreadByToken(id: string, token: string): Promise<{ events: CustomerVisibleEvent[] }> {
    return request<{ events: CustomerVisibleEvent[] }>(`/customer/tickets/${id}/thread?token=${encodeURIComponent(token)}`);
  },

  async postCustomerReply(id: string, token: string, body: string): Promise<{ success: boolean; message_id: string }> {
    return request<{ success: boolean; message_id: string }>(`/customer/tickets/${id}/reply?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  },

  async reopenCustomerTicket(id: string, token: string, reason: string): Promise<{
    success: boolean;
    ticket_id: string;
    cycle_no?: number;
    reopened?: boolean;
    linked_new_ticket?: boolean;
  }> {
    return request<{
      success: boolean;
      ticket_id: string;
      cycle_no?: number;
      reopened?: boolean;
      linked_new_ticket?: boolean;
    }>(`/customer/tickets/${id}/reopen?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Cold start health probe
  async checkHealth(): Promise<{ status: string; time: string }> {
    return request<{ status: string; time: string }>('/health');
  },

  // Lead Dashboard & SLA Analytics
  async getLeadDashboard(params?: {
    agent_id?: string;
    priority?: string;
    date_range?: string;
  }): Promise<LeadDashboardData> {
    const searchParams = new URLSearchParams();
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.priority) searchParams.set('priority', params.priority);
    if (params?.date_range) searchParams.set('date_range', params.date_range);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request<LeadDashboardData>(`/analytics/lead-dashboard${qs}`);
  },

  getLeadExportCsvUrl(params?: {
    agent_id?: string;
    priority?: string;
    date_range?: string;
  }): string {
    const searchParams = new URLSearchParams();
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.priority) searchParams.set('priority', params.priority);
    if (params?.date_range) searchParams.set('date_range', params.date_range);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return `/api/analytics/export-csv${qs}`;
  },

  // Holiday Calendar
  async getHolidays(): Promise<{ holidays: Holiday[] }> {
    return request<{ holidays: Holiday[] }>('/admin/holidays');
  },

  async createHoliday(date: string, name: string): Promise<{ holiday: Holiday }> {
    return request<{ holiday: Holiday }>('/admin/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, name })
    });
  },

  async deleteHoliday(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/admin/holidays/${id}`, {
      method: 'DELETE'
    });
  },

  // SLA Policies
  async getSlaPolicies(): Promise<{ policies: SlaPolicy[] }> {
    return request<{ policies: SlaPolicy[] }>('/admin/sla-policies');
  },

  async updateSlaPolicy(
    priority: string,
    data: { respond_minutes?: number; resolve_minutes?: number; resolve_mode?: 'fixed_minutes' | 'end_of_response_day' }
  ): Promise<{ policy: SlaPolicy; notice: string }> {
    return request<{ policy: SlaPolicy; notice: string }>(`/admin/sla-policies/${priority}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  // System Settings
  async getSettings(): Promise<{ settings: SystemSetting[] }> {
    return request<{ settings: SystemSetting[] }>('/admin/settings');
  },

  async updateSetting(
    key: string,
    value: unknown,
    description?: string
  ): Promise<{ setting: SystemSetting; notice: string }> {
    return request<{ setting: SystemSetting; notice: string }>(`/admin/settings/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, description })
    });
  },

  // Canned Replies Management (Lead / Admin)
  async createCannedReply(data: {
    title: string;
    content: string;
    shortcut?: string;
    category?: string;
  }): Promise<{ canned_reply: CannedReply }> {
    return request<{ canned_reply: CannedReply }>('/canned-replies', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateCannedReply(
    id: string,
    data: { title?: string; content?: string; shortcut?: string; category?: string }
  ): Promise<{ canned_reply: CannedReply }> {
    return request<{ canned_reply: CannedReply }>(`/canned-replies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  async deleteCannedReply(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/canned-replies/${id}`, {
      method: 'DELETE'
    });
  },

  // Admin User Management
  async getAdminUsers(): Promise<{ users: User[] }> {
    return request<{ users: User[] }>('/admin/users');
  },

  async createUser(data: {
    email: string;
    name: string;
    role: string;
  }): Promise<{ user: User }> {
    return request<{ user: User }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateUser(
    id: string,
    data: { name?: string; role?: string; active?: boolean }
  ): Promise<{ user: User }> {
    return request<{ user: User }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }
};
