import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockRemainingMs, recordFailure, recordSuccess } from "./rate-limit";

/**
 * The login throttle is the only brake on online PIN guessing, and PINs are
 * 4 digits — 10,000 possibilities. Its constants (5 fails, 15 min) are the
 * kind of boundary that a `>=`/`>` slip moves silently: nothing crashes, the
 * lock just opens one attempt early, forever.
 *
 * Each test uses a unique phone key because the store is module-level state.
 */

let n = 0;
const phone = () => `999000${n++}`;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("login lockout", () => {
  it("does not lock before the limit", () => {
    const p = phone();
    for (let i = 0; i < 4; i++) recordFailure(p);
    expect(lockRemainingMs(p)).toBe(0);
  });

  it("locks on the 5th failure", () => {
    const p = phone();
    for (let i = 0; i < 5; i++) recordFailure(p);
    expect(lockRemainingMs(p)).toBeGreaterThan(0);
  });

  it("stays locked for 15 minutes", () => {
    const p = phone();
    for (let i = 0; i < 5; i++) recordFailure(p);
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(lockRemainingMs(p), "still locked at 14 min").toBeGreaterThan(0);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(lockRemainingMs(p), "released after 15 min").toBe(0);
  });

  it("keeps an untouched phone unlocked", () => {
    expect(lockRemainingMs(phone())).toBe(0);
  });

  it("clears the count on a successful login", () => {
    const p = phone();
    for (let i = 0; i < 4; i++) recordFailure(p);
    recordSuccess(p);
    for (let i = 0; i < 4; i++) recordFailure(p);
    expect(lockRemainingMs(p), "the pre-success failures must not carry over").toBe(0);
  });

  it("locks one phone without affecting another", () => {
    const a = phone();
    const b = phone();
    for (let i = 0; i < 5; i++) recordFailure(a);
    expect(lockRemainingMs(a)).toBeGreaterThan(0);
    expect(lockRemainingMs(b)).toBe(0);
  });

  it("slides the window — stale failures don't accumulate", () => {
    // The documented behaviour: occasional mistypes over days must not add up
    // into a lockout. 4 fails, a long gap, then more fails starts a fresh count.
    const p = phone();
    for (let i = 0; i < 4; i++) recordFailure(p);
    vi.advanceTimersByTime(16 * 60 * 1000); // > WINDOW_MS
    for (let i = 0; i < 4; i++) recordFailure(p);
    expect(lockRemainingMs(p)).toBe(0);
  });

  it("locks when 5 failures land inside the window", () => {
    const p = phone();
    for (let i = 0; i < 4; i++) recordFailure(p);
    vi.advanceTimersByTime(10 * 60 * 1000); // < WINDOW_MS — count survives
    recordFailure(p);
    expect(lockRemainingMs(p)).toBeGreaterThan(0);
  });

  it("gives a fresh allowance after a lock expires", () => {
    // recordFailure resets fails to 0 when it locks, so the next window starts
    // clean. Pinning it: a lockout must not become permanent after one bad day.
    const p = phone();
    for (let i = 0; i < 5; i++) recordFailure(p);
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(lockRemainingMs(p)).toBe(0);
    for (let i = 0; i < 4; i++) recordFailure(p);
    expect(lockRemainingMs(p), "4 fails in the new window must not lock").toBe(0);
  });
});
