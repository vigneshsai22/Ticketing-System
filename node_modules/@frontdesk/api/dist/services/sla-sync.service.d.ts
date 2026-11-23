import { DatabaseClient } from '../db/client.js';
import { SlaPolicyInput, HolidayInput, WorkingHoursConfig } from '@frontdesk/sla';
import { TicketPriority } from '@frontdesk/shared';
export interface SlaContext {
    policies: Record<TicketPriority, SlaPolicyInput>;
    holidays: HolidayInput[];
    workingHours: WorkingHoursConfig;
    autoCloseMinutes: number;
    reopenWindowDays: number;
}
export declare function loadSlaContext(db: DatabaseClient): Promise<SlaContext>;
