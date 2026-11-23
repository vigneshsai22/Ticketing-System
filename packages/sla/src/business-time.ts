import { DateTime } from 'luxon';
import {
  WorkingHoursConfig,
  HolidayInput,
  PauseInterval,
  SlaSettingsConfig
} from './types.js';

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  start: '09:30',
  end: '18:30',
  timezone: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5] // Monday through Friday
};

export const DEFAULT_SETTINGS: SlaSettingsConfig = {
  working_hours: DEFAULT_WORKING_HOURS,
  business_day_minutes: 540,
  auto_close_minutes: 2700,
  reopen_window_days: 5
};

export function toDateTime(
  t: Date | DateTime | string,
  zone: string = DEFAULT_WORKING_HOURS.timezone
): DateTime {
  if (DateTime.isDateTime(t)) {
    return t.setZone(zone);
  }
  if (t instanceof Date) {
    return DateTime.fromJSDate(t, { zone });
  }
  return DateTime.fromISO(t, { zone });
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function isHoliday(dt: DateTime, holidays: HolidayInput[] = []): boolean {
  const dateStr = dt.toISODate();
  if (!dateStr) return false;
  return holidays.some(h => h.date === dateStr);
}

export function isWorkingDay(
  dt: DateTime,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): boolean {
  const isWeekday = config.days.includes(dt.weekday);
  if (!isWeekday) return false;
  return !isHoliday(dt, holidays);
}

/**
 * Checks if the given instant falls within business hours (09:30:00 - 18:30:00, Mon-Fri, non-holiday).
 * Note: 18:30:00 is considered the closing instant of the business day.
 */
export function isWorkingTime(
  t: Date | DateTime | string,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): boolean {
  const dt = toDateTime(t, config.timezone);
  if (!isWorkingDay(dt, config, holidays)) {
    return false;
  }
  const startMins = parseTimeToMinutes(config.start);
  const endMins = parseTimeToMinutes(config.end);
  const currentMins = dt.hour * 60 + dt.minute + dt.second / 60;

  return currentMins >= startMins && currentMins < endMins;
}

/**
 * Returns the next valid working instant.
 * If t is already during working hours, returns t.
 * If t is off-hours, weekend, or holiday, advances to 09:30 on the next working day.
 */
export function nextWorkingInstant(
  t: Date | DateTime | string,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): DateTime {
  let dt = toDateTime(t, config.timezone);

  const startMins = parseTimeToMinutes(config.start);
  const endMins = parseTimeToMinutes(config.end);
  const startHour = Math.floor(startMins / 60);
  const startMinute = startMins % 60;

  // Loop forward until we find a working instant
  let safetyCounter = 0;
  while (safetyCounter++ < 365) {
    if (isWorkingDay(dt, config, holidays)) {
      const currentMins = dt.hour * 60 + dt.minute + dt.second / 60;
      if (currentMins < startMins) {
        // Earlier today: clock starts at 09:30 today
        return dt.set({
          hour: startHour,
          minute: startMinute,
          second: 0,
          millisecond: 0
        });
      }
      if (currentMins < endMins) {
        // Currently in working hours
        return dt;
      }
    }

    // Move to 09:30 on the next calendar day
    dt = dt.plus({ days: 1 }).set({
      hour: startHour,
      minute: startMinute,
      second: 0,
      millisecond: 0
    });
  }
  return dt;
}

interface NormalizedPause {
  start: DateTime;
  end: DateTime; // if open-ended, may extend far into future
}

function normalizePauses(
  pauses: PauseInterval[] = [],
  zone: string
): NormalizedPause[] {
  const result: NormalizedPause[] = [];

  for (const p of pauses) {
    const start = toDateTime(p.startedAt, zone);
    const end = p.endedAt
      ? toDateTime(p.endedAt, zone)
      : start.plus({ years: 10 }); // open-ended pause

    if (end > start) {
      result.push({ start, end });
    }
  }

  // Sort by start time
  result.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  // Merge overlapping pauses
  const merged: NormalizedPause[] = [];
  for (const cur of result) {
    if (merged.length === 0) {
      merged.push({ ...cur });
    } else {
      const prev = merged[merged.length - 1];
      if (cur.start <= prev.end) {
        if (cur.end > prev.end) {
          prev.end = cur.end;
        }
      } else {
        merged.push({ ...cur });
      }
    }
  }

  return merged;
}

interface Segment {
  start: DateTime;
  end: DateTime;
  durationMinutes: number;
}

/**
 * Computes non-paused business intervals within a single day's window [windowStart, windowEnd].
 */
function getActiveWorkingSegments(
  windowStart: DateTime,
  windowEnd: DateTime,
  mergedPauses: NormalizedPause[]
): Segment[] {
  if (windowEnd <= windowStart) return [];

  const segments: Segment[] = [];
  let pointer = windowStart;

  for (const pause of mergedPauses) {
    if (pause.end <= pointer) continue;
    if (pause.start >= windowEnd) break;

    // We have a pause overlapping [pointer, windowEnd]
    const pStart = pause.start < pointer ? pointer : pause.start;
    const pEnd = pause.end > windowEnd ? windowEnd : pause.end;

    if (pStart > pointer) {
      // There is working time before the pause starts
      const duration = pStart.diff(pointer, 'minutes').minutes;
      if (duration > 0) {
        segments.push({
          start: pointer,
          end: pStart,
          durationMinutes: duration
        });
      }
    }

    pointer = pEnd;
  }

  if (pointer < windowEnd) {
    const duration = windowEnd.diff(pointer, 'minutes').minutes;
    if (duration > 0) {
      segments.push({
        start: pointer,
        end: windowEnd,
        durationMinutes: duration
      });
    }
  }

  return segments;
}

/**
 * Adds business minutes to a starting instant, skipping weekends, holidays, off-hours,
 * and any pause intervals.
 */
export function addBusinessMinutes(
  start: Date | DateTime | string,
  minutes: number,
  pauses: PauseInterval[] = [],
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): DateTime {
  let dt = nextWorkingInstant(start, config, holidays);

  if (minutes <= 0) {
    return dt;
  }

  const zone = config.timezone;
  const normalizedPauses = normalizePauses(pauses, zone);

  const startMins = parseTimeToMinutes(config.start);
  const endMins = parseTimeToMinutes(config.end);
  const startHour = Math.floor(startMins / 60);
  const startMinute = startMins % 60;
  const endHour = Math.floor(endMins / 60);
  const endMinute = endMins % 60;

  let remainingMinutes = minutes;
  let safetyCounter = 0;
  const MAX_DAYS = 365;

  while (remainingMinutes > 0 && safetyCounter++ < MAX_DAYS) {
    if (isWorkingDay(dt, config, holidays)) {
      const dayEnd = dt.set({
        hour: endHour,
        minute: endMinute,
        second: 0,
        millisecond: 0
      });

      // Window for current day is [dt, dayEnd]
      if (dayEnd > dt) {
        const segments = getActiveWorkingSegments(dt, dayEnd, normalizedPauses);

        for (const seg of segments) {
          if (remainingMinutes <= seg.durationMinutes) {
            return seg.start.plus({ minutes: remainingMinutes });
          }
          remainingMinutes -= seg.durationMinutes;
        }
      }
    }

    // Move to 09:30 on next day
    dt = dt.plus({ days: 1 }).set({
      hour: startHour,
      minute: startMinute,
      second: 0,
      millisecond: 0
    });
  }

  return dt;
}

/**
 * Computes business minutes elapsed between two instants, excluding weekends,
 * holidays, off-hours, and any pauses.
 */
export function businessMinutesBetween(
  a: Date | DateTime | string,
  b: Date | DateTime | string,
  pauses: PauseInterval[] = [],
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
  holidays: HolidayInput[] = []
): number {
  const dtA = toDateTime(a, config.timezone);
  const dtB = toDateTime(b, config.timezone);

  if (dtB <= dtA) return 0;

  const zone = config.timezone;
  const normalizedPauses = normalizePauses(pauses, zone);

  const startMins = parseTimeToMinutes(config.start);
  const endMins = parseTimeToMinutes(config.end);
  const startHour = Math.floor(startMins / 60);
  const startMinute = startMins % 60;
  const endHour = Math.floor(endMins / 60);
  const endMinute = endMins % 60;

  let totalMinutes = 0;
  let currentDay = dtA.startOf('day');
  const endDay = dtB.startOf('day');

  while (currentDay <= endDay) {
    if (isWorkingDay(currentDay, config, holidays)) {
      const dayStart = currentDay.set({
        hour: startHour,
        minute: startMinute,
        second: 0,
        millisecond: 0
      });
      const dayEnd = currentDay.set({
        hour: endHour,
        minute: endMinute,
        second: 0,
        millisecond: 0
      });

      const winStart = dtA > dayStart ? dtA : dayStart;
      const winEnd = dtB < dayEnd ? dtB : dayEnd;

      if (winEnd > winStart) {
        const segments = getActiveWorkingSegments(winStart, winEnd, normalizedPauses);
        for (const seg of segments) {
          totalMinutes += seg.durationMinutes;
        }
      }
    }

    currentDay = currentDay.plus({ days: 1 });
  }

  return Math.round(totalMinutes);
}

/**
 * Returns the end of the working day (18:30) in Asia/Kolkata that contains the given instant.
 */
export function getEndOfWorkingDay(
  t: Date | DateTime | string,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS
): DateTime {
  const dt = toDateTime(t, config.timezone);
  const endMins = parseTimeToMinutes(config.end);
  const endHour = Math.floor(endMins / 60);
  const endMinute = endMins % 60;

  return dt.set({
    hour: endHour,
    minute: endMinute,
    second: 0,
    millisecond: 0
  });
}
