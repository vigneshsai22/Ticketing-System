"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shiftable_clock_js_1 = require("./shiftable-clock.js");
class FixedBaseClock {
    fixedDate;
    constructor(fixedDate) {
        this.fixedDate = fixedDate;
    }
    now() {
        return new Date(this.fixedDate.getTime());
    }
}
(0, vitest_1.describe)('ShiftableClock', () => {
    const baseTime = new Date('2026-03-02T09:30:00.000Z');
    (0, vitest_1.it)('defaults to base clock time when not shifted', () => {
        const base = new FixedBaseClock(baseTime);
        const clock = new shiftable_clock_js_1.ShiftableClock(base);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-03-02T09:30:00.000Z');
    });
    (0, vitest_1.it)('shifts time forward by minutes, hours, days', () => {
        const base = new FixedBaseClock(baseTime);
        const clock = new shiftable_clock_js_1.ShiftableClock(base);
        clock.shiftByMinutes(30);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-03-02T10:00:00.000Z');
        clock.shiftByHours(2);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-03-02T12:00:00.000Z');
        clock.shiftByDays(1);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-03-03T12:00:00.000Z');
    });
    (0, vitest_1.it)('pins time with freeze mode', () => {
        const base = new FixedBaseClock(baseTime);
        const clock = new shiftable_clock_js_1.ShiftableClock(base);
        clock.set('2026-11-20T18:00:00.000Z', true);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-11-20T18:00:00.000Z');
        (0, vitest_1.expect)(clock.getState().frozen).toBe(true);
        clock.shiftByMinutes(15);
        (0, vitest_1.expect)(clock.now().toISOString()).toBe('2026-11-20T18:15:00.000Z');
    });
    (0, vitest_1.it)('resets back to base clock', () => {
        const base = new FixedBaseClock(baseTime);
        const clock = new shiftable_clock_js_1.ShiftableClock(base);
        clock.shiftByHours(48);
        (0, vitest_1.expect)(clock.now().toISOString()).not.toBe(baseTime.toISOString());
        clock.reset();
        (0, vitest_1.expect)(clock.now().toISOString()).toBe(baseTime.toISOString());
        (0, vitest_1.expect)(clock.getState().offsetMs).toBe(0);
        (0, vitest_1.expect)(clock.getState().frozen).toBe(false);
    });
});
//# sourceMappingURL=shiftable-clock.test.js.map