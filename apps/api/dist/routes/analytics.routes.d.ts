import { FastifyPluginAsync } from 'fastify';
export interface LeadDashboardQuery {
    agent_id?: string;
    priority?: string;
    date_range?: string;
}
declare const analyticsRoutes: FastifyPluginAsync;
export default analyticsRoutes;
