"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftableClock = void 0;
const system_clock_js_1 = require("./system-clock.js");
/**
 * ShiftableClock provides the foundation for the "Time Machine" demo control
 * and fast-forward testing. It allows shifting the current time by an offset
 * or pinning/freezing the clock at a specific moment in time.
 */
class ShiftableClock {
    offsetMs = 0;
    frozenDate = null;
    baseClock;
    constructor(baseClockOrInitialTime, freeze = false) {
        if (baseClockOrInitialTime && typeof baseClockOrInitialTime === 'object' && 'now' in baseClockOrInitialTime) {
            this.baseClock = baseClockOrInitialTime;
        }
        else {
            this.baseClock = new system_clock_js_1.SystemClock();
            if (baseClockOrInitialTime) {
                this.set(baseClockOrInitialTime, freeze);
            }
        }
    }
    now() {
        if (this.frozenDate) {
            return new Date(this.frozenDate.getTime());
        }
        return new Date(this.baseClock.now().getTime() + this.offsetMs);
    }
    /**
     * Shifts time forward or backward by the specified milliseconds.
     */
    shiftByMs(ms) {
        if (this.frozenDate) {
            this.frozenDate = new Date(this.frozenDate.getTime() + ms);
        }
        else {
            this.offsetMs += ms;
        }
    }
    shiftByMinutes(minutes) {
        this.shiftByMs(minutes * 60 * 1000);
    }
    shiftByHours(hours) {
        this.shiftByMs(hours * 3600 * 1000);
    }
    shiftByDays(days) {
        this.shiftByMs(days * 24 * 3600 * 1000);
    }
    /**
     * Set a specific target time. If freeze is true, time will not advance automatically.
     */
    set(target, freeze = false) {
        const targetDate = typeof target === 'string' ? new Date(target) : new Date(target.getTime());
        if (freeze) {
            this.frozenDate = targetDate;
        }
        else {
            this.frozenDate = null;
            this.offsetMs = targetDate.getTime() - this.baseClock.now().getTime();
        }
    }
    /**
     * Resets offset to 0 and unfreezes time, returning to base clock (real wall time).
     */
    reset() {
        this.offsetMs = 0;
        this.frozenDate = null;
    }
    /**
     * Unfreezes the clock while retaining the current elapsed offset.
     */
    unfreeze() {
        if (this.frozenDate) {
            this.offsetMs = this.frozenDate.getTime() - this.baseClock.now().getTime();
            this.frozenDate = null;
        }
    }
    getState() {
        return {
            offsetMs: this.offsetMs,
            frozen: this.frozenDate !== null,
            effectiveNow: this.now().toISOString()
        };
    }
}
exports.ShiftableClock = ShiftableClock;
//# sourceMappingURL=shiftable-clock.js.map