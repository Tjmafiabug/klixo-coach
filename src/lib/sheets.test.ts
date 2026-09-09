import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * withRetry is the only reliability control between the app and a rate-limited
 * external API. It is module-private, so the behavioural tests below re-declare
 * the same policy and pin it — a copy that would diverge silently. The source
 * assertions at the bottom are what actually catch divergence: they check the
 * real module still applies the policy to every call it makes.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/sheets.ts"), "utf8");

/** Mirror of the policy in sheets.ts. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let delay = 350;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const err = e as { code?: number; status?: number; response?: { status?: number } };
      const status = err?.code ?? err?.status ?? err?.response?.status;
      const transient = status === 429 || (typeof status === "number" && status >= 500 && status < 600);
      if (attempt >= tries - 1 || !transient) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 250)));
      delay *= 2;
    }
  }
}

const fail = (status: number) => Object.assign(new Error(`HTTP ${status}`), { code: status });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Run a withRetry call to completion while auto-advancing the fake clock. */
async function run<T>(fn: () => Promise<T>) {
  const p = withRetry(fn);
  const settled = p.catch(() => undefined);
  await vi.runAllTimersAsync();
  await settled;
  return p;
}

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(run(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("recovers from a rate-limit burst", async () => {
    // The realistic case: a whole batch marked at once spikes the ~60/min quota.
    const fn = vi.fn().mockRejectedValueOnce(fail(429)).mockRejectedValueOnce(fail(429)).mockResolvedValue("ok");
    await expect(run(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries 5xx", async () => {
    for (const status of [500, 502, 503]) {
      const fn = vi.fn().mockRejectedValueOnce(fail(status)).mockResolvedValue("ok");
      await expect(run(fn)).resolves.toBe("ok");
      expect(fn, `status ${status} should be retried`).toHaveBeenCalledTimes(2);
    }
  });

  it("gives up after exactly 4 attempts", async () => {
    const fn = vi.fn().mockRejectedValue(fail(429));
    await expect(run(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry auth or not-found failures", async () => {
    // The assertion that matters if someone later widens the `transient` check:
    // retrying a 401/403 just burns quota against a permission problem, and a
    // 404 will never become a 200.
    for (const status of [400, 401, 403, 404]) {
      const fn = vi.fn().mockRejectedValue(fail(status));
      await expect(run(fn)).rejects.toThrow();
      expect(fn, `status ${status} must not be retried`).toHaveBeenCalledTimes(1);
    }
  });

  it("reads the status from code, status or response.status", async () => {
    // googleapis surfaces the status differently depending on the failure path.
    for (const shape of [{ code: 429 }, { status: 429 }, { response: { status: 429 } }]) {
      const fn = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), shape)).mockResolvedValue("ok");
      await expect(run(fn)).resolves.toBe("ok");
      expect(fn, `shape ${JSON.stringify(shape)} should be recognised`).toHaveBeenCalledTimes(2);
    }
  });

  it("backs off exponentially rather than hammering", async () => {
    const fn = vi.fn().mockRejectedValue(fail(429));
    const delays: number[] = [];
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
    await withRetry(fn).catch(() => undefined);
    spy.mockRestore();
    expect(delays).toHaveLength(3);
    // 350 / 700 / 1400 plus up to 250ms jitter — each window strictly rising.
    expect(delays[0]).toBeGreaterThanOrEqual(350);
    expect(delays[1]).toBeGreaterThanOrEqual(700);
    expect(delays[2]).toBeGreaterThanOrEqual(1400);
  });
});

describe("sheets.ts applies the retry policy everywhere", () => {
  it("routes every Sheets call through withRetry", () => {
    // Writes were originally unwrapped, so a 429 mid-attendance-submission
    // surfaced to the teacher as a 500 and lost the register.
    const unwrapped = SRC.split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /^(const \w+ = )?await client\(\)/.test(line));
    expect(
      unwrapped,
      `unwrapped Sheets call(s) at line(s) ${unwrapped.map((u) => u.no).join(", ")} — wrap in withRetry()`,
    ).toEqual([]);
  });

  it("still treats 429 and 5xx as the transient set", () => {
    const fn = SRC.slice(SRC.indexOf("async function withRetry"));
    expect(fn).toMatch(/status === 429/);
    expect(fn).toMatch(/status >= 500 && status < 600/);
  });

  it("jitters the backoff so concurrent retries don't resynchronise", () => {
    expect(SRC).toMatch(/Math\.random\(\)/);
  });
});
