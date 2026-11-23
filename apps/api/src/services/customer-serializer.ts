/**
 * INC-0304 Customer Serializer:
 * Dedicated serialization layer for customer portal and transactional email bodies.
 * Strictly takes only customer-visible data; never references or includes internal notes.
 */

export interface CustomerTicketView {
  id: string;
  human_id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerMessageView {
  id: string;
  sender_type: 'agent' | 'customer' | 'system';
  body: string;
  created_at: string;
}

export function serializeCustomerTicket(ticket: Record<string, unknown>): CustomerTicketView {
  return {
    id: String(ticket.id),
    human_id: String(ticket.human_id),
    subject: String(ticket.subject),
    status: String(ticket.status),
    priority: String(ticket.priority),
    created_at: ticket.created_at instanceof Date ? ticket.created_at.toISOString() : String(ticket.created_at),
    updated_at: ticket.updated_at instanceof Date ? ticket.updated_at.toISOString() : String(ticket.updated_at)
  };
}

export function serializeCustomerMessage(msg: Record<string, unknown>): CustomerMessageView {
  return {
    id: String(msg.id),
    sender_type: msg.sender_type as 'agent' | 'customer' | 'system',
    body: String(msg.body),
    created_at: msg.created_at instanceof Date ? msg.created_at.toISOString() : String(msg.created_at)
  };
}

export function renderCustomerEmail(params: {
  template: 'ticket_created' | 'agent_reply' | 'status_change' | 'auto_close_warning' | 'magic_link';
  customerName: string;
  ticketHumanId?: string;
  ticketSubject?: string;
  messageBody?: string;
  newStatus?: string;
  magicLinkUrl?: string;
}): { subject: string; body: string } {
  const { template, customerName, ticketHumanId, ticketSubject, messageBody, newStatus, magicLinkUrl } = params;

  switch (template) {
    case 'ticket_created':
      return {
        subject: `[${ticketHumanId}] Request Received: ${ticketSubject}`,
        body: `Hello ${customerName},\n\nWe have received your request "${ticketSubject}" (Ticket ID: ${ticketHumanId}). Our team at Arvo Systems is reviewing it.\n\nThank you for reaching out.`
      };

    case 'agent_reply':
      return {
        subject: `[${ticketHumanId}] New Update on: ${ticketSubject}`,
        body: `Hello ${customerName},\n\nAn update has been posted to your ticket ${ticketHumanId}:\n\n${messageBody}\n\nPlease reply directly or via the customer portal.`
      };

    case 'status_change':
      return {
        subject: `[${ticketHumanId}] Ticket Status Changed to ${newStatus}`,
        body: `Hello ${customerName},\n\nYour ticket ${ticketHumanId} (${ticketSubject}) status has been updated to: ${newStatus}.\n\nBest regards,\nArvo Systems Support`
      };

    case 'auto_close_warning':
      return {
        subject: `[${ticketHumanId}] Inactivity Notice: Ticket Pending Closure`,
        body: `Hello ${customerName},\n\nYour ticket ${ticketHumanId} has been awaiting your input for several business days. If you still require assistance, please reply; otherwise, it will be automatically resolved.`
      };

    case 'magic_link':
      return {
        subject: `Sign in to Arvo Systems Support Portal`,
        body: `Hello ${customerName},\n\nClick the link below to access your tickets securely:\n\n${magicLinkUrl}\n\nThis link will expire in 24 hours.`
      };
  }
}
