import * as crypto from 'node:crypto';
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
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Computes the SHA-256 hash for an audit event chained to prevHash.
 */
export function computeEventHash(prevHash: string, payload: Record<string, unknown>): string {
  const serialized = canonicalJson(payload);
  return crypto.createHash('sha256').update(prevHash + serialized).digest('hex');
}

/**
 * Writes an immutable, hash-chained audit event for a ticket within an active transaction.
 * Requires that the ticket row is locked with SELECT ... FOR UPDATE beforehand.
 */
export async function recordAuditEvent(
  db: DatabaseClient,
  clock: Clock,
  input: AuditEventInput
): Promise<string> {
  // Query previous event hash for this ticket
  const prevRes = await db.query<{ hash: string }>(
    `SELECT hash FROM audit_events 
     WHERE ticket_id = $1 
     ORDER BY seq DESC LIMIT 1`,
    [input.ticketId]
  );

  const prevHash = prevRes.rows.length > 0 ? prevRes.rows[0].hash : 'GENESIS';
  const serverTimestamp = clock.now().toISOString();

  const payload: Record<string, unknown> = {
    ticket_id: input.ticketId,
    actor_type: input.actorType,
    actor_id: input.actorId || null,
    event_type: input.eventType,
    before: input.before || null,
    after: input.after || null,
    timestamp: serverTimestamp
  };

  const hash = computeEventHash(prevHash, payload);

  const insertRes = await db.query<{ id: string }>(
    `INSERT INTO audit_events (
       ticket_id, actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.ticketId,
      input.actorType,
      input.actorId || null,
      input.eventType,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      prevHash,
      hash,
      serverTimestamp
    ]
  );

  return insertRes.rows[0].id;
}

interface AuditRow {
  id: string;
  seq: string | number;
  ticket_id: string;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  prev_hash: string | null;
  hash: string;
  created_at: string | Date;
}

/**
 * Verifies the cryptographic hash chain for all audit events belonging to a ticket.
 * Reports the first broken link if tampering is detected.
 */
export async function verifyTicketAuditChain(
  db: DatabaseClient,
  ticketId: string
): Promise<VerifyChainResult> {
  const res = await db.query<AuditRow>(
    `SELECT * FROM audit_events 
     WHERE ticket_id = $1 
     ORDER BY seq ASC`,
    [ticketId]
  );

  const events = res.rows;
  if (events.length === 0) {
    return { valid: true, totalEvents: 0 };
  }

  let expectedPrevHash = 'GENESIS';

  for (const event of events) {
    const seq = Number(event.seq);

    // 1. Check backward linkage to previous event's hash
    if (event.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAtSeq: seq,
        brokenEventId: event.id,
        reason: `Previous hash pointer mismatch at seq ${seq}`,
        expectedHash: expectedPrevHash,
        actualHash: event.prev_hash || undefined
      };
    }

    // 2. Normalize timestamp string (PG dates may be returned as Date or ISO string)
    const timestamp = event.created_at instanceof Date
      ? event.created_at.toISOString()
      : new Date(event.created_at).toISOString();

    const payload: Record<string, unknown> = {
      ticket_id: event.ticket_id,
      actor_type: event.actor_type,
      actor_id: event.actor_id,
      event_type: event.event_type,
      before: event.before,
      after: event.after,
      timestamp
    };

    const recomputedHash = computeEventHash(expectedPrevHash, payload);

    // 3. Verify hash integrity
    if (recomputedHash !== event.hash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAtSeq: seq,
        brokenEventId: event.id,
        reason: `Cryptographic payload digest mismatch at seq ${seq} (data tampered)`,
        expectedHash: recomputedHash,
        actualHash: event.hash
      };
    }

    expectedPrevHash = event.hash;
  }

  return {
    valid: true,
    totalEvents: events.length
  };
}
