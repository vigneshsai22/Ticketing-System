import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { ShiftableClock } from '@frontdesk/shared';
export interface BuildAppOptions extends FastifyServerOptions {
    clock?: ShiftableClock;
    enableSchedulerTimer?: boolean;
}
export declare function buildApp(opts?: BuildAppOptions): Promise<FastifyInstance>;
