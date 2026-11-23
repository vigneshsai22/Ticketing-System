import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ShiftableClock } from '@frontdesk/shared';

declare module 'fastify' {
  interface FastifyInstance {
    clock: ShiftableClock;
  }
}

export interface ClockPluginOptions {
  clock?: ShiftableClock;
}

const clockPlugin: FastifyPluginAsync<ClockPluginOptions> = async (
  fastify: FastifyInstance,
  opts: ClockPluginOptions
) => {
  const clock = opts.clock || new ShiftableClock();
  fastify.decorate('clock', clock);
};

export default fp(clockPlugin);
