import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import * as crypto from 'node:crypto';
import { UserRole } from '@frontdesk/shared';

declare module 'fastify' {
  interface FastifyInstance {
    jwt: {
      sign: (payload: Record<string, unknown>, opts?: { expiresIn?: string }) => string;
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

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${data}`).digest('base64url');
  return `${header}.${data}.${sig}`;
}

function verifyHs256<T>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const [header, data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${data}`).digest('base64url');
  if (expectedSig !== sig) {
    throw new Error('Invalid JWT signature');
  }
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as T;
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const secret = process.env.JWT_SECRET || 'frontdesk-jwt-secret-key-32-chars-minimum';

  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'frontdesk-session-cookie-secret-32-chars-long'
  });

  fastify.decorate('jwt', {
    sign: (payload: Record<string, unknown>) => signHs256(payload, secret),
    verify: async <T>(token: string) => verifyHs256<T>(token, secret)
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token =
          request.cookies.frontdesk_session ||
          request.headers.authorization?.replace(/^Bearer\s+/i, '');

        if (!token) {
          return reply.status(401).send({ error: 'Unauthorized: missing session' });
        }

        const decoded = await fastify.jwt.verify<{
          id: string;
          email: string;
          name: string;
          role: UserRole;
        }>(token);

        request.user = decoded;
      } catch {
        return reply.status(401).send({ error: 'Unauthorized: invalid or expired session' });
      }
    }
  );

  fastify.decorate(
    'requireRole',
    (...roles: UserRole[]) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await fastify.authenticate(request, reply);
        if (reply.sent) return;

        if (!roles.includes(request.user.role)) {
          return reply.status(403).send({
            error: `Forbidden: role '${request.user.role}' does not have required permissions (${roles.join(', ')})`
          });
        }
      };
    }
  );
};

export default fp(authPlugin);

