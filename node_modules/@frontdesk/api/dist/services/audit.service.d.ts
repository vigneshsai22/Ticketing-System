import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
export interface AuditEventInput {
    ticketId: string;
    actorType: 'agent' | 'customer' | 'system';
    actorId?: string | null;
    eventType: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
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
/**
 * Serializes an object with keys sorted alphabetically to produce deterministic JSON.
 */
export declare function canonicalJson(obj: unknown): string;
/**
 * Computes the SHA-256 hash for an audit event chained to prevHash.
 */
export declare function computeEventHash(prevHash: string, payload: Record<string, unknown>): string;
/**
 * Writes an immutable, hash-chained audit event for a ticket within an active transaction.
 * Requires that the ticket row is locked with SELECT ... FOR UPDATE beforehand.
 */
export declare function recordAuditEvent(db: DatabaseClient, clock: Clock, input: AuditEventInput): Promise<string>;
/**
 * Verifies the cryptographic hash chain for all audit events belonging to a ticket.
 * Reports the first broken link if tampering is detected.
 */
export declare function verifyTicketAuditChain(db: DatabaseClient, ticketId: string): Promise<VerifyChainResult>;
