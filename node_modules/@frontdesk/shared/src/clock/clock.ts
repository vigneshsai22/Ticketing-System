export interface Clock {
  /**
   * Returns the current date/time according to this clock.
   * In production, this returns real wall-clock time.
   * Under the Time Machine or during testing, this returns simulated time.
   */
  now(): Date;
}
