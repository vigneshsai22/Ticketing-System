import { FastifyPluginAsync } from 'fastify';
import { UserRole } from '@frontdesk/shared';
declare module 'fastify' {
    interface FastifyInstance {
        jwt: {
            sign: (payload: Record<string, unknown>, opts?: {
                expiresIn?: string;
            }) => string;
            verify: <T = Record<string, unknown>>(token: string) => Promise<T>;
        };
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
    interface FastifyRequest {
        user: {
            id: string;
            email: string;
            name: string;
            role: UserRole;
        };
    }
}
declare const _default: FastifyPluginAsync;
export default _default;
