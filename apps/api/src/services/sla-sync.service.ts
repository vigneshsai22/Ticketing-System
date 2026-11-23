import { DatabaseClient } from '../db/client.js';
import {
  SlaPolicyInput,
  HolidayInput,
  WorkingHoursConfig,
  DEFAULT_WORKING_HOURS
} from '@frontdesk/sla';
import { TicketPriority } from '@frontdesk/shared';

export interface SlaContext {
  policies: Record<TicketPriority, SlaPolicyInput>;
  holidays: HolidayInput[];
  workingHours: WorkingHoursConfig;
  autoCloseMinutes: number;
  reopenWindowDays: number;
}

export async function loadSlaContext(db: DatabaseClient): Promise<SlaContext> {
  // 1. Load policies
  const policyRes = await db.query<{
    priority: TicketPriority;
    respond_minutes: number;
    resolve_minutes: number;
    resolve_mode: 'fixed_minutes' | 'end_of_response_day';
  }>('SELECT priority, respond_minutes, resolve_minutes, resolve_mode FROM sla_policies');

  const policies: Partial<Record<TicketPriority, SlaPolicyInput>> = {};
  for (const row of policyRes.rows) {
    policies[row.priority] = {
      priority: row.priority,
      respond_minutes: Number(row.respond_minutes),
      resolve_minutes: Number(row.resolve_minutes),
      resolve_mode: row.resolve_mode
    };
  }

  // Fallbacks if table is empty
  const defaultPolicies: Record<TicketPriority, SlaPolicyInput> = {
    urgent: policies.urgent || { priority: 'urgent', respond_minutes: 120, resolve_minutes: 540, resolve_mode: 'end_of_response_day' },
    medium: policies.medium || { priority: 'medium', respond_minutes: 270, resolve_minutes: 1620, resolve_mode: 'fixed_minutes' },
    low: policies.low || { priority: 'low', respond_minutes: 540, resolve_minutes: 2700, resolve_mode: 'fixed_minutes' }
  };

  // 2. Load holidays
  const holidayRes = await db.query<{ date: string; name: string }>(
    'SELECT date::text, name FROM holidays ORDER BY date ASC'
  );
  const holidays: HolidayInput[] = holidayRes.rows.map(h => ({
    date: h.date.substring(0, 10),
    name: h.name
  }));

  // 3. Load settings
  const settingsRes = await db.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM settings'
  );

  let workingHours = DEFAULT_WORKING_HOURS;
  let autoCloseMinutes = 2700;
  let reopenWindowDays = 5;

  for (const s of settingsRes.rows) {
    if (s.key === 'working_hours') {
      workingHours = s.value as WorkingHoursConfig;
    } else if (s.key === 'auto_close_minutes') {
      autoCloseMinutes = Number(s.value);
    } else if (s.key === 'reopen_window_days') {
      reopenWindowDays = Number(s.value);
    }
  }

  return {
    policies: defaultPolicies as Record<TicketPriority, SlaPolicyInput>,
    holidays,
    workingHours,
    autoCloseMinutes,
    reopenWindowDays
  };
}
