import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
export interface MagicLinkRecord {
    id: string;
    token_hash: string;
    customer_id: string | null;
    ticket_id: string | null;
    expires_at: string;
    used_at: string | null;
}
export declare function resetRateLimits(): void;
export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
}
export declare function checkRateLimit(key: string, clock: Clock, limit?: number, windowMs?: number): RateLimitResult;
export declare function hashMagicToken(rawToken: string): string;
/**
 * Creates and stores a hashed magic link token with an expiration window.
 */
export declare function createMagicLink(db: DatabaseClient, clock: Clock, options: {
    customerId?: string;
    ticketId?: string;
    expiresInHours?: number;
}): Promise<{
    rawToken: string;
    expiresAt: string;
}>;
/**
 * Verifies that a raw token exists, matches hash, and is not expired.
 */
export declare function verifyMagicLink(db: DatabaseClient, clock: Clock, rawToken: string): Promise<MagicLinkRecord | null>;
