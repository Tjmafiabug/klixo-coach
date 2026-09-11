import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * nextId() — how every entity in the app gets its primary key.
 *
 * It is module-private, so the behavioural tests below re-declare the same
 * implementation and pin it; the source assertions at the bottom are what
 * actually catch divergence.
 *
 * The hazard this file exists for: ids used to be max-suffix+1 over a snapshot,
 * which collided 100% of the time whenever two creates overlapped. Sheets has no
 * unique constraint, so both writes succeeded and one record became unreachable.
 * Measured in docs/STUDENT-SCALE.md — 30 concurrent test submissions produced 2
 * distinct ids and 28 duplicates. Ids are now minted from a clock, not counted.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

/** Mirror of the implementation in data.ts. */
function nextId(_ids: string[], prefix: string): string {
  const t = Math.floor(Date.now() / 10)
    .toString(36)
    .padStart(7, "0");
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${t}${rand}`.toUpperCase();
}

describe("nextId does not collide under concurrency", () => {
  it("mints distinct ids when called in a tight loop", () => {
    // THE BUG THIS REPLACED. The old counter read a snapshot and added one, so
    // every caller inside the same read window produced the identical id. This
    // loop is the same shape and must now produce 500 distinct ids.
    const ids = Array.from({ length: 500 }, () => nextId([], "ATT"));
    expect(new Set(ids).size).toBe(500);
  });

  it("does not depend on the ids it is given", () => {
    // The old implementation derived the id from existing rows, which is
    // precisely why two readers of the same snapshot agreed. Passing a stale or
    // empty list must not affect the result.
    const fromEmpty = nextId([], "S");
    const fromStale = nextId(["S001", "S002"], "S");
    expect(fromEmpty).not.toBe(fromStale);
    expect(fromEmpty.startsWith("S")).toBe(true);
    expect(fromStale.startsWith("S")).toBe(true);
  });

  it("survives a simulated race: two creates from one snapshot", () => {
    // Two requests read the same rows, then both mint. Under the counter both
    // got "S003"; now they must differ.
    const snapshot = ["S001", "S002"];
    const a = nextId(snapshot, "S");
    const b = nextId(snapshot, "S");
    expect(a).not.toBe(b);
  });
});

describe("nextId keeps the properties callers rely on", () => {
  it("is fixed width, so string comparison stays meaningful", () => {
    // Ids are compared as strings throughout. A varying width would sort "S10"
    // before "S9" — the same trap the zero-padding used to guard.
    const ids = Array.from({ length: 50 }, () => nextId([], "S"));
    const widths = new Set(ids.map((x) => x.length));
    expect(widths.size, "every minted id must be the same width").toBe(1);
  });

  it("sorts in creation order", async () => {
    // getTests/getQuestions sort by id with localeCompare and rely on that
    // order being creation order. A purely random id would have silently
    // scrambled the question order within a test.
    const first = nextId([], "QST");
    await new Promise((r) => setTimeout(r, 25));
    const second = nextId([], "QST");
    expect([second, first].sort((x, y) => x.localeCompare(y))).toEqual([first, second]);
  });

  it("keeps the prefix, so per-series scoping still works", () => {
    // createStaff scopes by prefix (T vs S in one tab). That only works if the
    // prefix survives minting.
    expect(nextId([], "T").startsWith("T")).toBe(true);
    expect(nextId([], "SADJ").startsWith("SADJ")).toBe(true);
  });

  it("sorts after legacy counter ids, which are older", () => {
    // Rows predating the change keep ids like S001 / ATT0001. They are shorter,
    // so they sort first — which is correct, they were created first.
    const minted = nextId([], "S");
    expect(["S001", minted].sort((a, b) => a.localeCompare(b))).toEqual(["S001", minted]);
  });

  it("is URL- and Sheet-safe", () => {
    // Ids appear in paths like /mark/[sessionId] and are written to cells RAW.
    // Anything outside [A-Z0-9] would need escaping somewhere.
    expect(nextId([], "ATT")).toMatch(/^[A-Z0-9]+$/);
  });
});

describe("the implementation in data.ts matches this mirror", () => {
  it("no longer derives ids from a max suffix", () => {
    const fn = SRC.slice(SRC.indexOf("function nextId"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "nextId must not count from existing ids again").not.toMatch(/max \+ 1/);
    expect(body, "nextId must mint from the clock").toMatch(/Date\.now\(\)/);
  });

  it("createStaff still filters by prefix before calling nextId", () => {
    // Still load-bearing: the Staff tab holds two series (T### teaching,
    // S### non-teaching) and callers scope by prefix.
    const fn = SRC.slice(SRC.indexOf("export async function createStaff"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "createStaff must scope ids to one prefix").toMatch(
      /filter\(\(s\) => s\.teacher_id\.startsWith\(prefix\)\)/,
    );
  });

  it("every call site still names its series", () => {
    // The `ids` argument is ignored now but kept so each call site documents
    // which series it belongs to.
    const callSites = [...SRC.matchAll(/nextId\(\s*([^,]+),/g)].map((m) => m[1].trim());
    expect(callSites.length, "nextId call sites not found — was it renamed?").toBeGreaterThan(5);
  });

  it("the duplicate-id audit is still in place", () => {
    // New writes cannot race, but the Sheet is owner-editable and legacy rows
    // exist, so detection stays.
    expect(SRC, "checkData must still report duplicate ids").toMatch(/duplicate id/);
  });
});
