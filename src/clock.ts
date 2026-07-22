// Injectable clock — every time-dependent decision routes through here so tests
// can override `now()` without touching Date or Date.now() inline.

export interface Clock {
  /** Current epoch-milliseconds. */
  now(): number;
}

/** Default clock: real wall time. */
const wallClock: Clock = { now: () => Date.now() };

let active: Clock = wallClock;

/** Get the current epoch-ms from the active clock. */
export function now(): number {
  return active.now();
}

/** Override the clock (test-only). Pass `null` to reset to wall time. */
export function setClock(c: Clock | null): void {
  active = c ?? wallClock;
}

/** Format epoch-ms as a local time string HH:MM in the given UTC offset. */
export function formatTime(epochMs: number, utcOffsetHours: number): string {
  const d = new Date(epochMs + utcOffsetHours * 3600_000);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
