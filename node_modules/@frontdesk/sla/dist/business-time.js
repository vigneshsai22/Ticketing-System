"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.DEFAULT_WORKING_HOURS = void 0;
exports.toDateTime = toDateTime;
exports.isHoliday = isHoliday;
exports.isWorkingDay = isWorkingDay;
exports.isWorkingTime = isWorkingTime;
exports.nextWorkingInstant = nextWorkingInstant;
exports.addBusinessMinutes = addBusinessMinutes;
exports.businessMinutesBetween = businessMinutesBetween;
exports.getEndOfWorkingDay = getEndOfWorkingDay;
const luxon_1 = require("luxon");
exports.DEFAULT_WORKING_HOURS = {
    start: '09:30',
    end: '18:30',
    timezone: 'Asia/Kolkata',
    days: [1, 2, 3, 4, 5] // Monday through Friday
};
exports.DEFAULT_SETTINGS = {
    working_hours: exports.DEFAULT_WORKING_HOURS,
    business_day_minutes: 540,
    auto_close_minutes: 2700,
    reopen_window_days: 5
};
function toDateTime(t, zone = exports.DEFAULT_WORKING_HOURS.timezone) {
    if (luxon_1.DateTime.isDateTime(t)) {
        return t.setZone(zone);
    }
    if (t instanceof Date) {
        return luxon_1.DateTime.fromJSDate(t, { zone });
    }
    return luxon_1.DateTime.fromISO(t, { zone });
}
function parseTimeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}
function isHoliday(dt, holidays = []) {
    const dateStr = dt.toISODate();
    if (!dateStr)
        return false;
    return holidays.some(h => h.date === dateStr);
}
function isWorkingDay(dt, config = exports.DEFAULT_WORKING_HOURS, holidays = []) {
    const isWeekday = config.days.includes(dt.weekday);
    if (!isWeekday)
        return false;
    return !isHoliday(dt, holidays);
}
/**
 * Checks if the given instant falls within business hours (09:30:00 - 18:30:00, Mon-Fri, non-holiday).
 * Note: 18:30:00 is considered the closing instant of the business day.
 */
function isWorkingTime(t, config = exports.DEFAULT_WORKING_HOURS, holidays = []) {
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
function nextWorkingInstant(t, config = exports.DEFAULT_WORKING_HOURS, holidays = []) {
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
function normalizePauses(pauses = [], zone) {
    const result = [];
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
    const merged = [];
    for (const cur of result) {
        if (merged.length === 0) {
            merged.push({ ...cur });
        }
        else {
            const prev = merged[merged.length - 1];
            if (cur.start <= prev.end) {
                if (cur.end > prev.end) {
                    prev.end = cur.end;
                }
            }
            else {
                merged.push({ ...cur });
            }
        }
    }
    return merged;
}
/**
 * Computes non-paused business intervals within a single day's window [windowStart, windowEnd].
 */
function getActiveWorkingSegments(windowStart, windowEnd, mergedPauses) {
    if (windowEnd <= windowStart)
        return [];
    const segments = [];
    let pointer = windowStart;
    for (const pause of mergedPauses) {
        if (pause.end <= pointer)
            continue;
        if (pause.start >= windowEnd)
            break;
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
function addBusinessMinutes(start, minutes, pauses = [], config = exports.DEFAULT_WORKING_HOURS, holidays = []) {
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
function businessMinutesBetween(a, b, pauses = [], config = exports.DEFAULT_WORKING_HOURS, holidays = []) {
    const dtA = toDateTime(a, config.timezone);
    const dtB = toDateTime(b, config.timezone);
    if (dtB <= dtA)
        return 0;
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
function getEndOfWorkingDay(t, config = exports.DEFAULT_WORKING_HOURS) {
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
//# sourceMappingURL=business-time.js.map