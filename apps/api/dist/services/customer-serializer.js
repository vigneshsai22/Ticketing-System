"use strict";
/**
 * INC-0304 Customer Serializer:
 * Dedicated serialization layer for customer portal and transactional email bodies.
 * Strictly takes only customer-visible data; never references or includes internal notes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeCustomerTicket = serializeCustomerTicket;
exports.serializeCustomerMessage = serializeCustomerMessage;
exports.renderCustomerEmail = renderCustomerEmail;
function serializeCustomerTicket(ticket) {
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
function serializeCustomerMessage(msg) {
    return {
        id: String(msg.id),
        sender_type: msg.sender_type,
        body: String(msg.body),
        created_at: msg.created_at instanceof Date ? msg.created_at.toISOString() : String(msg.created_at)
    };
}
function renderCustomerEmail(params) {
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
//# sourceMappingURL=customer-serializer.js.map