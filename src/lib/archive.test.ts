import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveCutoff, DEFAULT_RETENTION_MONTHS } from "./data";

/**
 * The archive boundary.
 *
 * `archiveCutoff` decides which rows live in the hot tab and which are eligible
 * to move out. Every hot path depends on never reaching past it, and every cold
 * path depends on reaching past it correctly, so the arithmetic is pure and
 * pinned here rather than discovered in production.
 */

const SRC_DATA = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");
const SRC_SHEETS = readFileSync(join(process.cwd(), "src/lib/sheets.ts"), "utf8");

const cfg = (months?: string) =>
  new Map<string, string>(months === undefined ? [] : [["retention_months", months]]);

describe("archiveCutoff", () => {
  it("keeps `retention_months` months including the current one", () => {
    // 6 months on 2026-09-11 means Apr, May, Jun, Jul, Aug, Sep stay live.
    expect(archiveCutoff(cfg("6"), "2026-09-11")).toBe("2026-04-01");
  });

  it("is always the first of a month", () => {
    // getBatchRegister renders one month at a time. A mid-month cutoff would
    // split its unit of work across two tabs.
    for (const d of ["2026-09-01", "2026-09-11", "2026-09-30"]) {
      expect(archiveCutoff(cfg("6"), d)).toBe("2026-04-01");
    }
  });

  it("crosses a year boundary correctly", () => {
    expect(archiveCutoff(cfg("6"), "2026-02-15")).toBe("2025-09-01");
    expect(archiveCutoff(cfg("12"), "2026-01-31")).toBe("2025-02-01");
  });

  it("defaults when Config says nothing", () => {
    expect(archiveCutoff(cfg(), "2026-09-11")).toBe(
      archiveCutoff(cfg(String(DEFAULT_RETENTION_MONTHS)), "2026-09-11"),
    );
  });

  it("clamps to at least 2 months, so hot paths can never reach past it", () => {
    // BACKLOG_DAYS is 14: a teacher may backfill two weeks. A 1-month retention
    // would let the job archive marks that are still editable, and then
    // submitAttendance would write a correction the register could not show.
    // A number the owner typed is clamped, not ignored: 0 and -5 mean "as
    // little as you allow", which is 2 months — not the 6-month default.
    expect(archiveCutoff(cfg("1"), "2026-09-11")).toBe("2026-08-01");
    expect(archiveCutoff(cfg("0"), "2026-09-11")).toBe("2026-08-01");
    expect(archiveCutoff(cfg("-5"), "2026-09-11")).toBe("2026-08-01");
  });

  it("clamps the top end", () => {
    expect(archiveCutoff(cfg("9999"), "2026-09-11")).toBe(archiveCutoff(cfg("120"), "2026-09-11"));
  });

  it("survives junk in the Config cell", () => {
    // The Sheet is owner-editable; someone will type "six months" in there.
    // Only a non-number falls back to the default.
    for (const junk of ["", "   ", "six", "6 months", "abc"]) {
      expect(archiveCutoff(cfg(junk), "2026-09-11")).toBe("2026-04-01");
    }
  });

  it("floors a fractional value rather than producing a broken date", () => {
    expect(archiveCutoff(cfg("6.9"), "2026-09-11")).toBe("2026-04-01");
  });

  it("the minimum cutoff is always further back than the backfill window", () => {
    // Pin the relationship, not just the number: if BACKLOG_DAYS ever grows
    // past a month, this is the test that should fail.
    const backlogDays = Number(SRC_DATA.match(/BACKLOG_DAYS\s*=\s*(\d+)/)?.[1] ?? "14");
    const cutoff = archiveCutoff(cfg("2"), "2026-09-11");
    const gapDays = (Date.parse("2026-09-11") - Date.parse(cutoff)) / 86_400_000;
    expect(gapDays).toBeGreaterThan(backlogDays);
  });
});

describe("archive reads stay off the hot path", () => {
  it("the archive tab name is never in KNOWN_TABS", () => {
    // Being outside that list is the entire mechanism. If an _Archive name ever
    // appears there it joins the batchGet every render performs.
    const known = SRC_SHEETS.slice(
      SRC_SHEETS.indexOf("const KNOWN_TABS"),
      SRC_SHEETS.indexOf("];", SRC_SHEETS.indexOf("const KNOWN_TABS")),
    );
    expect(known).not.toMatch(/_Archive/);
  });

  it("readArchiveTab issues its own read and is not part of allTabs", () => {
    const fn = SRC_SHEETS.slice(SRC_SHEETS.indexOf("export async function readArchiveTab"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body, "must read the archive range directly").toMatch(/values\.get/);
    expect(body, "must not go through the hot-path batch").not.toMatch(/allTabs\(/);
  });

  it("a missing archive tab reads as empty, not as an error", () => {
    // A centre that has never run the job has no archive tab. That is the
    // normal case, not an exceptional one.
    const fn = SRC_SHEETS.slice(SRC_SHEETS.indexOf("export async function readArchiveTab"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/Unable to parse range/);
  });

  it("the merge helpers skip the archive when the window is recent", () => {
    // This is what keeps every hot path at zero extra reads.
    for (const name of ["attendanceSince", "sessionsSince"]) {
      const fn = SRC_DATA.slice(SRC_DATA.indexOf(`async function ${name}`));
      const body = fn.slice(0, fn.indexOf("\n}\n"));
      expect(body, `${name} must short-circuit above the cutoff`).toMatch(
        /from !== undefined && from >= cutoff/,
      );
    }
  });

  it("only cold paths call the merge helpers", () => {
    // If a hot path (getDayBoard, getRoster, submitAttendance, generateSessions,
    // getOwnerStats) ever calls one, every page render pays a second request.
    const coldOnly = ["getBatchRegister", "reportAttendance", "reportStudent", "getSessionsInRange"];
    // Walk lines and track the enclosing top-level function, so a nested
    // arrow or a helper defined mid-file cannot be misattributed.
    const lines = SRC_DATA.split("\n");
    let current = "(top level)";
    const real: string[] = [];
    for (const line of lines) {
      const decl = line.match(/^(?:export )?(?:async )?function (\w+)/);
      if (decl) current = decl[1];
      if (/\b(attendanceSince|sessionsSince)\(/.test(line) && !decl) real.push(current);
    }
    for (const c of real) {
      expect(coldOnly, `${c} must not read the archive on a hot path`).toContain(c);
    }
    expect(real.length, "expected all four cold paths wired").toBeGreaterThanOrEqual(4);
  });
});
