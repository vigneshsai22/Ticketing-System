import { DateTime } from 'luxon';
import { WorkingHoursConfig, HolidayInput, PauseInterval, SlaSettingsConfig } from './types.js';
export declare const DEFAULT_WORKING_HOURS: WorkingHoursConfig;
export declare const DEFAULT_SETTINGS: SlaSettingsConfig;
export declare function toDateTime(t: Date | DateTime | string, zone?: string): DateTime;
export declare function isHoliday(dt: DateTime, holidays?: HolidayInput[]): boolean;
export declare function isWorkingDay(dt: DateTime, config?: WorkingHoursConfig, holidays?: HolidayInput[]): boolean;
/**
 * Checks if the given instant falls within business hours (09:30:00 - 18:30:00, Mon-Fri, non-holiday).
 * Note: 18:30:00 is considered the closing instant of the business day.
 */
export declare function isWorkingTime(t: Date | DateTime | string, config?: WorkingHoursConfig, holidays?: HolidayInput[]): boolean;
/**
 * Returns the next valid working instant.
 * If t is already during working hours, returns t.
 * If t is off-hours, weekend, or holiday, advances to 09:30 on the next working day.
 */
export declare function nextWorkingInstant(t: Date | DateTime | string, config?: WorkingHoursConfig, holidays?: HolidayInput[]): DateTime;
/**
 * Adds business minutes to a starting instant, skipping weekends, holidays, off-hours,
 * and any pause intervals.
 */
export declare function addBusinessMinutes(start: Date | DateTime | string, minutes: number, pauses?: PauseInterval[], config?: WorkingHoursConfig, holidays?: HolidayInput[]): DateTime;
/**
 * Computes business minutes elapsed between two instants, excluding weekends,
 * holidays, off-hours, and any pauses.
 */
export declare function businessMinutesBetween(a: Date | DateTime | string, b: Date | DateTime | string, pauses?: PauseInterval[], config?: WorkingHoursConfig, holidays?: HolidayInput[]): number;
/**
 * Returns the end of the working day (18:30) in Asia/Kolkata that contains the given instant.
 */
export declare function getEndOfWorkingDay(t: Date | DateTime | string, config?: WorkingHoursConfig): DateTime;
