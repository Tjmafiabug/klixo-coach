import "server-only";

/**
 * In-memory login throttle (N9). Locks a phone after MAX_FAILS wrong PINs for
 * LOCK_MS. Per-process: each serverless instance keeps its own map, so this is a
 * best-effort brake against online PIN guessing at one-centre scale, not a
 * distributed limiter. A persistent store (Sheet/KV) is the Phase-3 upgrade.
 */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count

interface Entry {
  fails: number;
  lockUntil: number;
  lastFail: number;
}

const store = new Map<string, Entry>();

/** Milliseconds remaining on a lock for `key`, or 0 if not locked. */
export function lockRemainingMs(key: string): number {
  const e = store.get(key);
  if (!e) return 0;
  const left = e.lockUntil - Date.now();
  return left > 0 ? left : 0;
}

/** Record a failed attempt; locks once MAX_FAILS happen within WINDOW_MS. The
 *  counter is a sliding window — a stale gap since the last failure resets it,
 *  so occasional mistypes over days don't accumulate into a lockout. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const e = store.get(key) ?? { fails: 0, lockUntil: 0, lastFail: 0 };
  if (now - e.lastFail > WINDOW_MS) e.fails = 0; // window expired → fresh count
  e.fails += 1;
  e.lastFail = now;
  if (e.fails >= MAX_FAILS) {
    e.lockUntil = now + LOCK_MS;
    e.fails = 0;
  }
  store.set(key, e);
}

/** Clear all state for `key` after a successful login. */
export function recordSuccess(key: string): void {
  store.delete(key);
}
