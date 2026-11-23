"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = canonicalJson;
exports.computeEventHash = computeEventHash;
exports.recordAuditEvent = recordAuditEvent;
exports.verifyTicketAuditChain = verifyTicketAuditChain;
const crypto = __importStar(require("node:crypto"));
/**
 * Serializes an object with keys sorted alphabetically to produce deterministic JSON.
 */
function canonicalJson(obj) {
    if (obj === null || obj === undefined) {
        return 'null';
    }
    if (typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
    }
    const record = obj;
    const sortedKeys = Object.keys(record).sort();
    const entries = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
    return '{' + entries.join(',') + '}';
}
/**
 * Computes the SHA-256 hash for an audit event chained to prevHash.
 */
function computeEventHash(prevHash, payload) {
    const serialized = canonicalJson(payload);
    return crypto.createHash('sha256').update(prevHash + serialized).digest('hex');
}
/**
 * Writes an immutable, hash-chained audit event for a ticket within an active transaction.
 * Requires that the ticket row is locked with SELECT ... FOR UPDATE beforehand.
 */
async function recordAuditEvent(db, clock, input) {
    // Query previous event hash for this ticket
    const prevRes = await db.query(`SELECT hash FROM audit_events 
     WHERE ticket_id = $1 
     ORDER BY seq DESC LIMIT 1`, [input.ticketId]);
    const prevHash = prevRes.rows.length > 0 ? prevRes.rows[0].hash : 'GENESIS';
    const serverTimestamp = clock.now().toISOString();
    const payload = {
        ticket_id: input.ticketId,
        actor_type: input.actorType,
        actor_id: input.actorId || null,
        event_type: input.eventType,
        before: input.before || null,
        after: input.after || null,
        timestamp: serverTimestamp
    };
    const hash = computeEventHash(prevHash, payload);
    const insertRes = await db.query(`INSERT INTO audit_events (
       ticket_id, actor_type, actor_id, event_type, before, after, prev_hash, hash, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`, [
        input.ticketId,
        input.actorType,
        input.actorId || null,
        input.eventType,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        prevHash,
        hash,
        serverTimestamp
    ]);
    return insertRes.rows[0].id;
}
/**
 * Verifies the cryptographic hash chain for all audit events belonging to a ticket.
 * Reports the first broken link if tampering is detected.
 */
async function verifyTicketAuditChain(db, ticketId) {
    const res = await db.query(`SELECT * FROM audit_events 
     WHERE ticket_id = $1 
     ORDER BY seq ASC`, [ticketId]);
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
        const payload = {
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
//# sourceMappingURL=audit.service.js.map