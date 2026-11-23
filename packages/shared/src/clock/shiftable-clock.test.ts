import { describe, it, expect } from 'vitest';
import { ShiftableClock } from './shiftable-clock.js';
import { Clock } from './clock.js';

class FixedBaseClock implements Clock {
  constructor(private readonly fixedDate: Date) {}
  now(): Date {
    return new Date(this.fixedDate.getTime());
  }
}

describe('ShiftableClock', () => {
  const baseTime = new Date('2026-03-02T09:30:00.000Z');

  it('defaults to base clock time when not shifted', () => {
    const base = new FixedBaseClock(baseTime);
    const clock = new ShiftableClock(base);
    expect(clock.now().toISOString()).toBe('2026-03-02T09:30:00.000Z');
  });

  it('shifts time forward by minutes, hours, days', () => {
    const base = new FixedBaseClock(baseTime);
    const clock = new ShiftableClock(base);

    clock.shiftByMinutes(30);
    expect(clock.now().toISOString()).toBe('2026-03-02T10:00:00.000Z');

    clock.shiftByHours(2);
    expect(clock.now().toISOString()).toBe('2026-03-02T12:00:00.000Z');

    clock.shiftByDays(1);
    expect(clock.now().toISOString()).toBe('2026-03-03T12:00:00.000Z');
  });

  it('pins time with freeze mode', () => {
    const base = new FixedBaseClock(baseTime);
    const clock = new ShiftableClock(base);

    clock.set('2026-11-20T18:00:00.000Z', true);
    expect(clock.now().toISOString()).toBe('2026-11-20T18:00:00.000Z');
    expect(clock.getState().frozen).toBe(true);

    clock.shiftByMinutes(15);
    expect(clock.now().toISOString()).toBe('2026-11-20T18:15:00.000Z');
  });

  it('resets back to base clock', () => {
    const base = new FixedBaseClock(baseTime);
    const clock = new ShiftableClock(base);

    clock.shiftByHours(48);
    expect(clock.now().toISOString()).not.toBe(baseTime.toISOString());

    clock.reset();
    expect(clock.now().toISOString()).toBe(baseTime.toISOString());
    expect(clock.getState().offsetMs).toBe(0);
    expect(clock.getState().frozen).toBe(false);
  });
});
