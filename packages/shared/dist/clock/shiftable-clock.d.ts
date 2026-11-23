import { Clock } from './clock.js';
export interface ClockState {
    offsetMs: number;
    frozen: boolean;
    effectiveNow: string;
}
/**
 * ShiftableClock provides the foundation for the "Time Machine" demo control
 * and fast-forward testing. It allows shifting the current time by an offset
 * or pinning/freezing the clock at a specific moment in time.
 */
export declare class ShiftableClock implements Clock {
    private offsetMs;
    private frozenDate;
    private readonly baseClock;
    constructor(baseClockOrInitialTime?: Clock | Date | string, freeze?: boolean);
    now(): Date;
    /**
     * Shifts time forward or backward by the specified milliseconds.
     */
    shiftByMs(ms: number): void;
    shiftByMinutes(minutes: number): void;
    shiftByHours(hours: number): void;
    shiftByDays(days: number): void;
    /**
     * Set a specific target time. If freeze is true, time will not advance automatically.
     */
    set(target: Date | string, freeze?: boolean): void;
    /**
     * Resets offset to 0 and unfreezes time, returning to base clock (real wall time).
     */
    reset(): void;
    /**
     * Unfreezes the clock while retaining the current elapsed offset.
     */
    unfreeze(): void;
    getState(): ClockState;
}
