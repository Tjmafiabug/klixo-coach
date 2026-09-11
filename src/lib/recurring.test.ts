import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * expandRecurring — the single source of truth for which recurring sessions
 * should exist. Both the nightly generator and the calendar projection go
 * through it.
 *
 * The bug this file exists for: it read `expected_end_date` but not
 * `Batch.active`. Deactivating a batch is the obvious way to say "this class is
 * finished" and is what the manage screen offers, but a deactivated batch with
 * a live timetable rule kept minting sessions every night. `expected_end_date`
 * would have capped it and is blank on every batch in production, so nothing
 * stopped it.
 *
 * It is module-private, so the behavioural tests mirror the implementation and
 * the source assertions at the bottom catch divergence.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

type Rule = {
  slot_id: string;
  batch_id: string;
  day_of_week: string;
  effective_from: string;
  effective_to: string;
};
type Batch = { batch_id: string; active: string; expected_end_date?: string };

const addDays = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const dowOf = (d: string) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00:00Z").getUTCDay()];

/** Mirror of the implementation in data.ts. */
function expandRecurring(
  rules: Rule[],
  holidays: Set<string>,
  batches: Batch[],
  start: string,
  end: string,
) {
  const batchEnd = new Map(batches.map((b) => [b.batch_id, b.expected_end_date ?? ""]));
  const open = new Set(batches.filter((b) => b.active === "TRUE").map((b) => b.batch_id));
  const out: { slot_id: string; batch_id: string; date: string }[] = [];
  for (const r of rules) {
    if (!open.has(r.batch_id)) continue;
    const days = r.day_of_week.split(",").map((x) => x.trim());
    const endDate = batchEnd.get(r.batch_id) ?? "";
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (holidays.has(d)) continue;
      if (!days.includes(dowOf(d))) continue;
      if (endDate && d > endDate) break;
      if (!(r.effective_from <= d && (r.effective_to === "" || r.effective_to >= d))) continue;
      out.push({ slot_id: r.slot_id, batch_id: r.batch_id, date: d });
    }
  }
  return out;
}

// 2026-09-07 is a Monday.
const MON = "2026-09-07";
const rule: Rule = {
  slot_id: "TT001",
  batch_id: "B001",
  day_of_week: "Mon",
  effective_from: "2026-01-01",
  effective_to: "",
};
const active: Batch = { batch_id: "B001", active: "TRUE" };
const closed: Batch = { batch_id: "B001", active: "FALSE" };
const none = new Set<string>();

describe("a closed batch stops wanting sessions", () => {
  it("an active batch produces its weekly instances", () => {
    const got = expandRecurring([rule], none, [active], MON, addDays(MON, 21));
    expect(got.map((x) => x.date)).toEqual([MON, addDays(MON, 7), addDays(MON, 14), addDays(MON, 21)]);
  });

  it("THE BUG: a deactivated batch produces none", () => {
    // Before the fix this returned the same four dates as above, so the nightly
    // cron kept writing sessions for a class the owner had closed.
    const got = expandRecurring([rule], none, [closed], MON, addDays(MON, 21));
    expect(got).toEqual([]);
  });

  it("does not need expected_end_date to be set", () => {
    // Every batch in production has a blank expected_end_date, so a fix that
    // relied on stamping it would not have helped the existing data.
    expect(closed.expected_end_date).toBeUndefined();
    expect(expandRecurring([rule], none, [closed], MON, addDays(MON, 21))).toEqual([]);
  });

  it("closes only the batch that is inactive", () => {
    const two = [
      rule,
      { ...rule, slot_id: "TT002", batch_id: "B002" },
    ];
    const batches = [closed, { batch_id: "B002", active: "TRUE" }];
    const got = expandRecurring(two, none, batches, MON, addDays(MON, 7));
    expect(new Set(got.map((x) => x.batch_id))).toEqual(new Set(["B002"]));
  });

  it("treats a missing batch row as closed, not as open", () => {
    // A rule pointing at a deleted batch is a dangling reference the integrity
    // scan reports. Generating sessions for it would be worse than not.
    const got = expandRecurring([rule], none, [], MON, addDays(MON, 7));
    expect(got).toEqual([]);
  });
});

describe("the existing caps still apply", () => {
  it("expected_end_date still stops an active batch", () => {
    const capped = { batch_id: "B001", active: "TRUE", expected_end_date: addDays(MON, 7) };
    const got = expandRecurring([rule], none, [capped], MON, addDays(MON, 21));
    expect(got.map((x) => x.date)).toEqual([MON, addDays(MON, 7)]);
  });

  it("holidays are still skipped", () => {
    const got = expandRecurring([rule], new Set([addDays(MON, 7)]), [active], MON, addDays(MON, 14));
    expect(got.map((x) => x.date)).toEqual([MON, addDays(MON, 14)]);
  });

  it("the rule's own effective range still applies", () => {
    const expiring = { ...rule, effective_to: addDays(MON, 7) };
    const got = expandRecurring([expiring], none, [active], MON, addDays(MON, 21));
    expect(got.map((x) => x.date)).toEqual([MON, addDays(MON, 7)]);
  });
});

describe("the implementation in data.ts matches this mirror", () => {
  it("expandRecurring takes batches, not a prebuilt batchEnd map", () => {
    const fn = SRC.slice(SRC.indexOf("function expandRecurring"));
    const sig = fn.slice(0, fn.indexOf("): RecurringInstance[]"));
    expect(sig, "must receive the batch rows so it can read active").toMatch(/batches: Batch\[\]/);
  });

  it("it skips rules whose batch is not active", () => {
    const fn = SRC.slice(SRC.indexOf("function expandRecurring"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    // An allow-list, so a rule whose batch row was deleted also generates
    // nothing — a deny-list would treat a missing batch as permanently open.
    expect(body, "must build the open set").toMatch(/b\.active === "TRUE"/);
    expect(body, "must skip rules outside it").toMatch(/!open\.has\(r\.batch_id\)/);
  });

  it("both call sites pass batches", () => {
    // Generation and the calendar projection must agree about what should
    // exist, or the calendar shows classes the generator will not write.
    const calls = [...SRC.matchAll(/expandRecurring\(rules, holidays, (\w+),/g)].map((m) => m[1]);
    expect(calls.length, "expected two call sites").toBe(2);
    expect(new Set(calls)).toEqual(new Set(["batches"]));
  });
});
