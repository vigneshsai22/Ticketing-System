import { FastifyPluginAsync } from 'fastify';
import { ShiftableClock } from '@frontdesk/shared';
declare module 'fastify' {
    interface FastifyInstance {
        clock: ShiftableClock;
    }
}
export interface ClockPluginOptions {
    clock?: ShiftableClock;
}
declare const _default: FastifyPluginAsync<ClockPluginOptions>;
export default _default;
