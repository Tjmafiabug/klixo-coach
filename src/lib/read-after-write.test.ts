import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * readTab is deduped per request (React cache), which is what makes a 20-read
 * dashboard affordable against a ~60 reads/min quota. The hazard that buys is
 * read-after-write inside a single request: once a row is deleted the row
 * numbers shift, but the cached copy still describes the old layout, so
 * resequencing against it writes to the WRONG rows.
 *
 * deleteChapter is the one place that re-reads after a delete, and it must use
 * readTabUncached. This test fails if that regresses, or if a new function
 * grows the same shape.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

/** Split data.ts into top-level function bodies. */
function functions(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^(?:export )?async function (\w+)/gm;
  const starts: { name: string; at: number }[] = [];
  for (let m = re.exec(SRC); m; m = re.exec(SRC)) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    out.push({ name: s.name, body: SRC.slice(s.at, starts[i + 1]?.at ?? SRC.length) });
  });
  return out;
}

const WRITE = /deleteRows\(|appendRows\(|updateValues\(|batchUpdateValues\(/;

describe("read-after-write must bypass the per-request cache", () => {
  const fns = functions();

  it("parses the module (guards against scanning nothing)", () => {
    expect(fns.length).toBeGreaterThan(50);
  });

  it("deleteChapter re-reads uncached after deleting a row", () => {
    const fn = fns.find((f) => f.name === "deleteChapter");
    expect(fn, "deleteChapter not found — was it renamed?").toBeDefined();
    const afterDelete = fn!.body.slice(fn!.body.indexOf("deleteRows("));
    expect(
      afterDelete,
      "the re-read after deleteRows must use readTabUncached, or it resequences against stale row numbers",
    ).toMatch(/readTabUncached</);
    expect(afterDelete).not.toMatch(/\breadTab</);
  });

  it("no function reads a tab with the cached reader after writing to it", () => {
    const offenders = fns
      .filter((f) => {
        const w = f.body.search(WRITE);
        if (w < 0) return false;
        const after = f.body.slice(w);
        // a cached readTab< AFTER a write in the same function is the hazard
        return /\breadTab</.test(after);
      })
      .map((f) => f.name);
    expect(
      offenders,
      `read-after-write via the cached readTab in: ${offenders.join(", ")} — ` +
        `use readTabUncached, the cache still holds the pre-write layout`,
    ).toEqual([]);
  });
});
