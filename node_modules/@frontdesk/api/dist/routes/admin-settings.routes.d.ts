import { FastifyPluginAsync } from 'fastify';
export interface HolidayRecord {
    id: string;
    date: string;
    name: string;
    created_at: string;
}
export interface SlaPolicyRecord {
    id: string;
    priority: 'urgent' | 'medium' | 'low';
    respond_minutes: number;
    resolve_minutes: number;
    resolve_mode: 'fixed_minutes' | 'end_of_response_day';
}
export interface SettingRecord {
    key: string;
    value: unknown;
    description: string | null;
}
declare const adminSettingsRoutes: FastifyPluginAsync;
export default adminSettingsRoutes;
