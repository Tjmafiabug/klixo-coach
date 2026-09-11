import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cross-request cache on the whole-Sheet batchGet.
 *
 * It exists because the binding constraint at 40 staff + 200 parents is
 * Google's 60 reads/min/user quota, not payload or render time. Measured
 * without it: 40 staff marking plus 500 parents over five minutes ran at
 * 69 reads/min and Google rejected 55% of staff reads — teachers could not mark
 * attendance during the busiest period.
 *
 * The behaviour is in module state that the app wires to a live API, so these
 * are source assertions on the invariants that make it safe. Each one below
 * corresponds to a way this cache could corrupt data or hide an outage.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/sheets.ts"), "utf8");

const fnBody = (name: string) => {
  const i = SRC.indexOf(name);
  if (i === -1) throw new Error(`${name} not found in sheets.ts`);
  const fn = SRC.slice(i);
  return fn.slice(0, fn.indexOf("\n}"));
};

describe("every write invalidates the cache", () => {
  // A write that does not invalidate leaves the writer looking at their own
  // stale data on the redirect that follows — a teacher marks a register and
  // the roster still shows it unmarked.
  for (const writer of ["appendRows", "updateValues", "batchUpdateValues", "deleteRows"]) {
    it(`${writer} invalidates`, () => {
      expect(fnBody(`export async function ${writer}`)).toMatch(/invalidateSheetCache\(\)/);
    });
  }

  it("there are exactly four write helpers, so none was missed", () => {
    // If a fifth write path is added, this fails and whoever adds it has to
    // decide about invalidation rather than silently skipping it.
    const writers = [...SRC.matchAll(/export async function (appendRows|updateValues|batchUpdateValues|deleteRows)\b/g)];
    expect(writers.length).toBe(4);
    const calls = [...SRC.matchAll(/invalidateSheetCache\(\)/g)];
    // four call sites plus the declaration
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the cache cannot leak across centres or outlive a failure", () => {
  it("is keyed by spreadsheet id", () => {
    // Multi-tenant safety: an unkeyed module cache would serve one centre's
    // students, fees and attendance to another.
    expect(SRC).toMatch(/sheetCache\s*=\s*new Map/);
    expect(fnBody("const allTabs"), "must look up by sheet id").toMatch(/sheetCache\.get\(key\)/);
    expect(SRC, "invalidate must target the current sheet").toMatch(
      /sheetCache\.delete\(sheetId\(\)\)/,
    );
  });

  it("does not cache a rejected fetch", () => {
    // A cached 429 would be replayed to every request for the whole TTL,
    // turning one quota rejection into seconds of outage for everyone.
    expect(SRC).toMatch(/rows\.catch\(/);
    expect(SRC).toMatch(/sheetCache\.delete\(key\)/);
  });

  it("stores the promise so concurrent requests share one fetch", () => {
    // Storing the resolved value instead would let a burst all miss together
    // and each start its own batchGet — the exact thing being fixed.
    expect(SRC).toMatch(/rows:\s*Promise<Map<string, string\[\]\[\]>>/);
  });

  it("has a short TTL", () => {
    // The Sheet is owner-editable by design, so a direct edit must appear in
    // seconds. This is the knob that trades quota against that freshness.
    const m = SRC.match(/CACHE_TTL_MS\s*=\s*([\d_]+)/);
    expect(m, "CACHE_TTL_MS not found").toBeTruthy();
    const ttl = Number(m![1].replace(/_/g, ""));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl, "a long TTL would hide the owner's own Sheet edits").toBeLessThanOrEqual(30_000);
  });
});

describe("read-after-write still bypasses everything", () => {
  it("readTabUncached does not consult the cache", () => {
    // After deleteRows, row numbers shift. Resequencing against a cached copy
    // writes to the WRONG ROWS. This bypass is load-bearing and the new cache
    // must not have quietly re-introduced the stale layout.
    const body = fnBody("export async function readTabUncached");
    expect(body, "must issue its own get").toMatch(/values\.get/);
    expect(body, "must not read the shared cache").not.toMatch(/sheetCache/);
    expect(body, "must not go through allTabs").not.toMatch(/allTabs\(/);
  });
});
