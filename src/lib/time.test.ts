import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * "Today" must be the centre's local date, never the server's UTC clock
 * (PLAN.md §11). Vercel lambdas run UTC, the centre runs Asia/Kolkata (+05:30) —
 * so between 18:30 and 00:00 UTC the two calendars disagree, and a bug here
 * silently writes attendance to the wrong day for 5.5 hours of every day.
 *
 * time.ts reads process.env.CENTER_TZ at call time, so each test sets it and
 * passes a fixed Date rather than mocking the clock.
 */

const load = async () => {
  // re-import per test: the module reads env inside the fn, but keep this
  // resilient if that ever changes to module scope.
  return await import("./time");
};

const ORIGINAL_TZ = process.env.CENTER_TZ;
beforeEach(() => {
  process.env.CENTER_TZ = "Asia/Kolkata";
});
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.CENTER_TZ;
  else process.env.CENTER_TZ = ORIGINAL_TZ;
});

describe("centerToday", () => {
  it("returns the centre's date, not the server's UTC date", async () => {
    const { centerToday } = await load();
    // 2026-06-24T20:00Z is already 2026-06-25 in Kolkata (+05:30 → 01:30).
    expect(centerToday(new Date("2026-06-24T20:00:00Z"))).toBe("2026-06-25");
  });

  it("holds the previous day just before the centre's midnight", async () => {
    const { centerToday } = await load();
    // 18:29Z = 23:59 IST — still the 24th.
    expect(centerToday(new Date("2026-06-24T18:29:00Z"))).toBe("2026-06-24");
  });

  it("rolls over exactly at the centre's midnight", async () => {
    const { centerToday } = await load();
    // 18:30Z = 00:00 IST on the 25th. This one minute is the whole bug class.
    expect(centerToday(new Date("2026-06-24T18:30:00Z"))).toBe("2026-06-25");
  });

  it("formats as YYYY-MM-DD (string date comparison is used everywhere)", async () => {
    const { centerToday } = await load();
    // data.ts compares dates as strings (date < today). Zero-padding is load-bearing.
    expect(centerToday(new Date("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });

  it("honours a non-IST centre timezone", async () => {
    process.env.CENTER_TZ = "America/New_York";
    const { centerToday } = await load();
    // 02:00Z on the 25th is still 22:00 on the 24th in New York (-04:00 DST).
    expect(centerToday(new Date("2026-06-25T02:00:00Z"))).toBe("2026-06-24");
  });
});

describe("centerDow", () => {
  it("returns short day names matching Timetable.day_of_week", async () => {
    const { centerDow } = await load();
    // 2026-06-24 was a Wednesday.
    expect(centerDow(new Date("2026-06-24T06:00:00Z"))).toBe("Wed");
  });

  it("uses the centre's day, not the server's", async () => {
    const { centerDow } = await load();
    // 20:00Z Wed = 01:30 IST Thu. Session generation keys off this: getting it
    // wrong schedules the whole timetable a day out.
    expect(centerDow(new Date("2026-06-24T20:00:00Z"))).toBe("Thu");
  });
});

describe("centerTimestamp", () => {
  it("carries the centre's offset", async () => {
    const { centerTimestamp } = await load();
    expect(centerTimestamp(new Date("2026-06-24T11:35:09Z"))).toBe("2026-06-24T17:05:09+05:30");
  });

  it("writes midnight as 00, not 24", async () => {
    const { centerTimestamp } = await load();
    // Intl h24 can render midnight as "24" — time.ts maps it explicitly.
    // Left unhandled this produces "T24:00:00", which sorts after every real
    // timestamp and would break latest-mark-wins.
    expect(centerTimestamp(new Date("2026-06-24T18:30:00Z"))).toBe("2026-06-25T00:00:00+05:30");
  });
});
