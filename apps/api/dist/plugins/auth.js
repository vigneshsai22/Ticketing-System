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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const crypto = __importStar(require("node:crypto"));
function signHs256(payload, secret) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${data}`).digest('base64url');
    return `${header}.${data}.${sig}`;
}
function verifyHs256(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }
    const [header, data, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${data}`).digest('base64url');
    if (expectedSig !== sig) {
        throw new Error('Invalid JWT signature');
    }
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
}
const authPlugin = async (fastify) => {
    const secret = process.env.JWT_SECRET || 'frontdesk-jwt-secret-key-32-chars-minimum';
    await fastify.register(cookie_1.default, {
        secret: process.env.COOKIE_SECRET || 'frontdesk-session-cookie-secret-32-chars-long'
    });
    fastify.decorate('jwt', {
        sign: (payload) => signHs256(payload, secret),
        verify: async (token) => verifyHs256(token, secret)
    });
    fastify.decorate('authenticate', async (request, reply) => {
        try {
            const token = request.cookies.frontdesk_session ||
                request.headers.authorization?.replace(/^Bearer\s+/i, '');
            if (!token) {
                return reply.status(401).send({ error: 'Unauthorized: missing session' });
            }
            const decoded = await fastify.jwt.verify(token);
            request.user = decoded;
        }
        catch {
            return reply.status(401).send({ error: 'Unauthorized: invalid or expired session' });
        }
    });
    fastify.decorate('requireRole', (...roles) => {
        return async (request, reply) => {
            await fastify.authenticate(request, reply);
            if (reply.sent)
                return;
            if (!roles.includes(request.user.role)) {
                return reply.status(403).send({
                    error: `Forbidden: role '${request.user.role}' does not have required permissions (${roles.join(', ')})`
                });
            }
        };
    });
};
exports.default = (0, fastify_plugin_1.default)(authPlugin);
//# sourceMappingURL=auth.js.map