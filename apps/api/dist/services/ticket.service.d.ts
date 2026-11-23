import { DatabaseClient } from '../db/client.js';
import { Clock, Ticket, TicketStatus, TicketPriority } from '@frontdesk/shared';
export declare class StatusTransitionError extends Error {
    fromStatus: string;
    toStatus: string;
    statusCode: number;
    constructor(fromStatus: string, toStatus: string);
}
export declare class OptimisticLockError extends Error {
    statusCode: number;
    constructor(message?: string);
}
export declare class TicketClaimError extends Error {
    currentOwner: string;
    statusCode: number;
    constructor(currentOwner: string);
}
export declare class ForbiddenError extends Error {
    statusCode: number;
    constructor(message: string);
}
export declare function assertLegalStatusTransition(from: TicketStatus, to: TicketStatus): void;
export interface CreateTicketInput {
    subject: string;
    priority: TicketPriority;
    customerId: string;
    initialMessage?: string;
    creatorId?: string | null;
    creatorType?: 'agent' | 'customer' | 'system';
}
export interface ActorContext {
    id: string;
    type: 'agent' | 'customer' | 'system';
    role?: string;
    name?: string;
}
export declare function createTicket(db: DatabaseClient, clock: Clock, input: CreateTicketInput): Promise<Ticket>;
/**
 * INC-0291: Atomic ticket claim.
 * Executes a single atomic UPDATE ... WHERE assignee_id IS NULL RETURNING *.
 * The loser receives an HTTP 409 with the current owner's name.
 */
export declare function claimTicket(db: DatabaseClient, clock: Clock, ticketId: string, agent: ActorContext): Promise<Ticket>;
/**
 * Release ticket assignment (assignee or lead/admin).
 */
export declare function releaseTicket(db: DatabaseClient, clock: Clock, ticketId: string, actor: ActorContext, expectedVersion?: number): Promise<Ticket>;
/**
 * Reassign ticket to another agent (Lead or Admin only).
 */
export declare function reassignTicket(db: DatabaseClient, clock: Clock, ticketId: string, newAssigneeId: string, actor: ActorContext, expectedVersion?: number): Promise<Ticket>;
/**
 * Transitions ticket status through the validated state machine,
 * with automatic SLA pause and resume bookkeeping.
 */
export declare function updateTicketStatus(db: DatabaseClient, clock: Clock, ticketId: string, newStatus: TicketStatus, actor: ActorContext, expectedVersion?: number): Promise<Ticket>;
