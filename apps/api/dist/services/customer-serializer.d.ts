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
export declare function serializeCustomerTicket(ticket: Record<string, unknown>): CustomerTicketView;
export declare function serializeCustomerMessage(msg: Record<string, unknown>): CustomerMessageView;
export declare function renderCustomerEmail(params: {
    template: 'ticket_created' | 'agent_reply' | 'status_change' | 'auto_close_warning' | 'magic_link';
    customerName: string;
    ticketHumanId?: string;
    ticketSubject?: string;
    messageBody?: string;
    newStatus?: string;
    magicLinkUrl?: string;
}): {
    subject: string;
    body: string;
};
