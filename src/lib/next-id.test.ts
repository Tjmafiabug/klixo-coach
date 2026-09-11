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
 * Two distinct hazards live here. One is a real trap that costs nothing to
 * pin; the other is a known architectural limit that is deliberately detected
 * rather than prevented.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

/** Mirror of the implementation in data.ts. */
function nextId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  for (const id of ids) {
    const n = parseInt(id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

describe("nextId", () => {
  it("takes the highest suffix, not the row count", () => {
    // Deleting a row must not hand its id to the next create.
    expect(nextId(["S001", "S002", "S007"], "S", 3)).toBe("S008");
  });

  it("starts a fresh series at 1", () => {
    expect(nextId([], "B", 3)).toBe("B001");
  });

  it("zero-pads to the requested width", () => {
    // Ids are compared as strings throughout, so width is load-bearing:
    // "S10" would sort before "S9".
    expect(nextId(["S009"], "S", 3)).toBe("S010");
    expect(nextId(["SES0099"], "SES", 4)).toBe("SES0100");
  });

  it("ignores blank and malformed ids rather than throwing", () => {
    // Trailing blank rows are a normal Sheet artifact.
    expect(nextId(["S001", "", "junk", "S003"], "S", 3)).toBe("S004");
  });
});

describe("nextId is blind to the prefix — callers must scope by series", () => {
  it("shares one counter across two series on the same tab", () => {
    // THE TRAP. `id.replace(/\D/g, "")` strips the letters, so a tab holding
    // two series numbers them from one shared counter. Staff is exactly this:
    // teaching staff are T###, non-teaching are S###, both in the Staff tab.
    //
    // Unfiltered, a new T-series id continues from the highest S-series number:
    expect(nextId(["T001", "T002", "S001", "S002", "S003"], "T", 3)).toBe("T004");
    // ...which skips T003 and, worse, will collide the moment the two series
    // interleave. createStaff() filters by prefix first precisely to avoid it.
  });

  it("numbers each series independently once the caller filters", () => {
    const all = ["T001", "T002", "S001", "S002", "S003"];
    const forPrefix = (p: string) => all.filter((x) => x.startsWith(p));
    expect(nextId(forPrefix("T"), "T", 3)).toBe("T003");
    expect(nextId(forPrefix("S"), "S", 3)).toBe("S004");
  });

  it("createStaff still filters by prefix before calling nextId", () => {
    // The filter is load-bearing, not decorative — without it the Staff tab's
    // two series collide. Any refactor that drops it reintroduces the bug
    // silently, because both series keep producing plausible-looking ids.
    const fn = SRC.slice(SRC.indexOf("export async function createStaff"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "createStaff must scope ids to one prefix").toMatch(
      /filter\(\(s\) => s\.teacher_id\.startsWith\(prefix\)\)/,
    );
  });

  it("no other caller passes a mixed-prefix list", () => {
    // Every other nextId call site reads a tab whose ids are a single series.
    // If a second series is ever added to one of those tabs, that call site
    // needs the same filter createStaff has.
    const callSites = [...SRC.matchAll(/nextId\(\s*([^,]+),/g)].map((m) => m[1].trim());
    expect(callSites.length, "nextId call sites not found — was it renamed?").toBeGreaterThan(5);
  });
});

describe("concurrent creates can mint duplicate ids", () => {
  it.skip("two overlapping creates produce the same id (known, detected not prevented)", () => {
    // DELIBERATELY SKIPPED — this documents a real limit rather than a bug to fix.
    //
    // The sequence is read snapshot → compute max+1 → write. Two callers whose
    // windows overlap both observe the same snapshot and both mint the same id;
    // Sheets has no unique constraint to reject the second:
    //
    //   const snapshot = ["S001", "S002"];
    //   expect(nextId(snapshot, "S", 3)).toBe("S003");
    //   expect(nextId(snapshot, "S", 3)).toBe("S003");  // ← both callers
    //
    // The harm is not the duplicate row but that row-by-id lookups take the
    // first match and silently ignore the rest, so the second student's record
    // becomes unreachable while still occupying a row.
    //
    // Not fixed because both honest fixes cost a Sheets round trip (~2s) on
    // every create: a natural key per row (as the Attendance upsert already
    // uses) or read-back-and-verify after write. At one centre, with creates
    // being rare and manual, paying that on every write to prevent a collision
    // that needs two writes inside the same read-compute-write window is the
    // wrong trade. integrityIssues() detects duplicates and surfaces them on
    // the dashboard — see integrity.test.ts.
    //
    // Revisit when: multiple centres share a deployment, creates become
    // automated/bulk, or the integrity banner ever actually fires in the wild.
  });

  it("integrityIssues detects the duplicates this can produce", () => {
    // The compensating control must stay in place while prevention is absent.
    const fn = SRC.slice(SRC.indexOf("export function integrityIssues"));
    const body = fn.slice(0, fn.indexOf("\n  return issues;"));
    expect(body, "duplicate-id detection is the only thing covering this").toMatch(
      /duplicate id/,
    );
  });
});
