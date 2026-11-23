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
exports.resetRateLimits = resetRateLimits;
exports.checkRateLimit = checkRateLimit;
exports.hashMagicToken = hashMagicToken;
exports.createMagicLink = createMagicLink;
exports.verifyMagicLink = verifyMagicLink;
const crypto = __importStar(require("node:crypto"));
// In-memory rate limiting map: token/ip -> timestamps[]
const rateLimitMap = new Map();
function resetRateLimits() {
    rateLimitMap.clear();
}
function checkRateLimit(key, clock, limit = 30, windowMs = 60_000) {
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
function hashMagicToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}
/**
 * Creates and stores a hashed magic link token with an expiration window.
 */
async function createMagicLink(db, clock, options) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashMagicToken(rawToken);
    const expiresInHours = options.expiresInHours || 24;
    const now = clock.now();
    const expiresAt = new Date(now.getTime() + expiresInHours * 3600 * 1000).toISOString();
    await db.query(`INSERT INTO magic_links (token_hash, customer_id, ticket_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`, [
        tokenHash,
        options.customerId || null,
        options.ticketId || null,
        expiresAt,
        now.toISOString()
    ]);
    return { rawToken, expiresAt };
}
/**
 * Verifies that a raw token exists, matches hash, and is not expired.
 */
async function verifyMagicLink(db, clock, rawToken) {
    const tokenHash = hashMagicToken(rawToken);
    const nowIso = clock.now().toISOString();
    const res = await db.query(`SELECT * FROM magic_links
     WHERE token_hash = $1 AND expires_at > $2`, [tokenHash, nowIso]);
    if (res.rows.length === 0) {
        return null;
    }
    return res.rows[0];
}
//# sourceMappingURL=magic-link.service.js.map