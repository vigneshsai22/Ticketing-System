import { Clock } from './clock.js';
import { SystemClock } from './system-clock.js';

export interface ClockState {
  offsetMs: number;
  frozen: boolean;
  effectiveNow: string; // ISO string
}

/**
 * ShiftableClock provides the foundation for the "Time Machine" demo control
 * and fast-forward testing. It allows shifting the current time by an offset
 * or pinning/freezing the clock at a specific moment in time.
 */
export class ShiftableClock implements Clock {
  private offsetMs: number = 0;
  private frozenDate: Date | null = null;
  private readonly baseClock: Clock;

  constructor(baseClockOrInitialTime?: Clock | Date | string, freeze: boolean = false) {
    if (baseClockOrInitialTime && typeof baseClockOrInitialTime === 'object' && 'now' in baseClockOrInitialTime) {
      this.baseClock = baseClockOrInitialTime as Clock;
    } else {
      this.baseClock = new SystemClock();
      if (baseClockOrInitialTime) {
        this.set(baseClockOrInitialTime as Date | string, freeze);
      }
    }
  }

  now(): Date {
    if (this.frozenDate) {
      return new Date(this.frozenDate.getTime());
    }
    return new Date(this.baseClock.now().getTime() + this.offsetMs);
  }

  /**
   * Shifts time forward or backward by the specified milliseconds.
   */
  shiftByMs(ms: number): void {
    if (this.frozenDate) {
      this.frozenDate = new Date(this.frozenDate.getTime() + ms);
    } else {
      this.offsetMs += ms;
    }
  }

  shiftByMinutes(minutes: number): void {
    this.shiftByMs(minutes * 60 * 1000);
  }

  shiftByHours(hours: number): void {
    this.shiftByMs(hours * 3600 * 1000);
  }

  shiftByDays(days: number): void {
    this.shiftByMs(days * 24 * 3600 * 1000);
  }

  /**
   * Set a specific target time. If freeze is true, time will not advance automatically.
   */
  set(target: Date | string, freeze: boolean = false): void {
    const targetDate = typeof target === 'string' ? new Date(target) : new Date(target.getTime());
    if (freeze) {
      this.frozenDate = targetDate;
    } else {
      this.frozenDate = null;
      this.offsetMs = targetDate.getTime() - this.baseClock.now().getTime();
    }
  }

  /**
   * Resets offset to 0 and unfreezes time, returning to base clock (real wall time).
   */
  reset(): void {
    this.offsetMs = 0;
    this.frozenDate = null;
  }

  /**
   * Unfreezes the clock while retaining the current elapsed offset.
   */
  unfreeze(): void {
    if (this.frozenDate) {
      this.offsetMs = this.frozenDate.getTime() - this.baseClock.now().getTime();
      this.frozenDate = null;
    }
  }

  getState(): ClockState {
    return {
      offsetMs: this.offsetMs,
      frozen: this.frozenDate !== null,
      effectiveNow: this.now().toISOString()
    };
  }
}
