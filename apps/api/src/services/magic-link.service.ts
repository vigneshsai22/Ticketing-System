import * as crypto from 'node:crypto';
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

// In-memory rate limiting map: token/ip -> timestamps[]
const rateLimitMap = new Map<string, number[]>();

export function resetRateLimits(): void {
  rateLimitMap.clear();
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export function checkRateLimit(
  key: string,
  clock: Clock,
  limit = 30,
  windowMs = 60_000
): RateLimitResult {
  const now = clock.now().getTime();
  const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const resetSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetSeconds
    };
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);

  const resetSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetSeconds
  };
}

export function hashMagicToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates and stores a hashed magic link token with an expiration window.
 */
export async function createMagicLink(
  db: DatabaseClient,
  clock: Clock,
  options: {
    customerId?: string;
    ticketId?: string;
    expiresInHours?: number;
  }
): Promise<{ rawToken: string; expiresAt: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashMagicToken(rawToken);

  const expiresInHours = options.expiresInHours || 24;
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + expiresInHours * 3600 * 1000).toISOString();

  await db.query(
    `INSERT INTO magic_links (token_hash, customer_id, ticket_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      tokenHash,
      options.customerId || null,
      options.ticketId || null,
      expiresAt,
      now.toISOString()
    ]
  );

  return { rawToken, expiresAt };
}

/**
 * Verifies that a raw token exists, matches hash, and is not expired.
 */
export async function verifyMagicLink(
  db: DatabaseClient,
  clock: Clock,
  rawToken: string
): Promise<MagicLinkRecord | null> {
  const tokenHash = hashMagicToken(rawToken);
  const nowIso = clock.now().toISOString();

  const res = await db.query<MagicLinkRecord>(
    `SELECT * FROM magic_links
     WHERE token_hash = $1 AND expires_at > $2`,
    [tokenHash, nowIso]
  );

  if (res.rows.length === 0) {
    return null;
  }

  return res.rows[0];
}
