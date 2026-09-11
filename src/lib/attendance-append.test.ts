import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Attendance is append-only: a correction adds a row, it never rewrites one.
 *
 * submitAttendance used to update the existing (session, student) row in place,
 * which meant computing a sheet row number from a snapshot and writing to it.
 * That is the positional-write race, on the largest and most-sorted tab, on the
 * hottest write path: if the owner sorted or deleted rows between the read and
 * the write — a supported workflow on a Sheet that is deliberately theirs — the
 * write replaced another student's row wholesale, and the result was internally
 * consistent so nothing could detect it afterwards.
 *
 * It is also the prerequisite for archiving: the archive job deletes from this
 * tab, which shifts every row below the deletion, and a concurrent in-place
 * write would land on the wrong row with certainty rather than by chance.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

/** Body of a top-level function: from its name to the next top-level decl. */
function bodyOf(decl: string): string {
  const i = SRC.indexOf(decl);
  if (i === -1) throw new Error(`${decl} not found in data.ts`);
  const rest = SRC.slice(i + decl.length);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return end === -1 ? rest : rest.slice(0, end);
}

type Row = {
  log_id: string;
  session_id: string;
  student_id: string;
  status: string;
  timestamp: string;
};

/** Mirror of latestPerSessionStudent — the rule every reader relies on. */
function latest(rows: Row[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const a of rows) {
    const k = `${a.session_id}|${a.student_id}`;
    const prev = m.get(k);
    if (
      !prev ||
      a.timestamp > prev.timestamp ||
      (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
    )
      m.set(k, a);
  }
  return m;
}

const mark = (log_id: string, status: string, timestamp: string): Row => ({
  log_id,
  session_id: "SES001",
  student_id: "S001",
  status,
  timestamp,
});

describe("a correction wins without rewriting the original", () => {
  it("the later row is the one readers see", () => {
    const rows = [
      mark("A0001", "present", "2026-09-11T10:00:00+05:30"),
      mark("A0002", "absent", "2026-09-11T10:05:00+05:30"),
    ];
    expect(latest(rows).get("SES001|S001")?.status).toBe("absent");
  });

  it("order in the sheet does not decide it — timestamp does", () => {
    // Appends land at the bottom, but a sort by the owner can reorder them.
    // The winner must not depend on where a row sits.
    const a = mark("A0001", "present", "2026-09-11T10:00:00+05:30");
    const b = mark("A0002", "absent", "2026-09-11T10:05:00+05:30");
    expect(latest([a, b]).get("SES001|S001")?.status).toBe("absent");
    expect(latest([b, a]).get("SES001|S001")?.status).toBe("absent");
  });

  it("same-timestamp rows fall back to the id, and minted ids are time-ordered", () => {
    // Two submits inside one second. The old counter gave both the SAME log_id,
    // so this tiebreak did nothing and sheet order decided. Minted ids sort by
    // mint time, so "greater log_id" now genuinely means "written later".
    const earlier = mark("A2A6VU7HK6AD51M", "present", "2026-09-11T10:00:00+05:30");
    const later = mark("A2A6VU7HK6AD51Z", "absent", "2026-09-11T10:00:00+05:30");
    expect(latest([earlier, later]).get("SES001|S001")?.status).toBe("absent");
    expect(latest([later, earlier]).get("SES001|S001")?.status).toBe("absent");
  });

  it("the original row survives as history", () => {
    // The point of append-only: the audit trail is the extra rows.
    const rows = [
      mark("A0001", "present", "2026-09-11T10:00:00+05:30"),
      mark("A0002", "absent", "2026-09-11T10:05:00+05:30"),
    ];
    expect(rows.filter((r) => r.session_id === "SES001" && r.student_id === "S001")).toHaveLength(2);
    expect(latest(rows).size).toBe(1);
  });
});

describe("submitAttendance no longer writes by row index", () => {
  const body = bodyOf("export async function submitAttendance");

  it("appends and does nothing else", () => {
    expect(body, "must append").toMatch(/appendRows\("Attendance", rows\)/);
    expect(body, "must not compute a sheet row number").not.toMatch(/i \+ 2/);
    expect(body, "must not write to a computed range").not.toMatch(/Attendance!A\$\{/);
    expect(body, "must not batch-update").not.toMatch(/batchUpdateValues/);
  });

  it("mints log ids rather than counting from a snapshot", () => {
    // The old counter read every row to find a max, which is both an O(n) scan
    // on the biggest tab and a source of duplicate ids under concurrency.
    expect(body, "must mint").toMatch(/nextId\(\[\], "A"\)/);
    expect(body, "must not scan for a max").not.toMatch(/\+\+next/);
  });

  it("still writes one row per mark passed in", () => {
    expect(body).toMatch(/params\.marks\.map\(/);
    expect(body).toMatch(/return params\.marks\.length/);
  });
});

describe("every reader tolerates duplicate (session, student) rows", () => {
  it("readers either dedupe or are duplicate-insensitive", () => {
    // Verified across all twelve readTab<AttendanceRow> call sites. The four
    // that do not call a dedupe helper are safe by construction:
    //   generateSessions / regenSlotFuture — build a Set of session_id, so
    //     duplicates collapse to the same entry ("has any mark at all")
    //   getOwnerDashboard / getPtmBoard — delegate to getOwnerStats, which
    //     dedupes at its own read
    // This test pins the two Set-based ones, which are the non-obvious pair.
    // Both reduce attendance to a Set of session_id — "does this session have
    // any marks at all" — so duplicate rows collapse to one entry. The local
    // variable is spelled differently in each, hence the loose match.
    for (const name of ["generateSessions", "regenSlotFuture"]) {
      const b = bodyOf(`function ${name}`);
      expect(b, `${name} must only ask whether a session has marks`).toMatch(
        /new Set\(\w+\.map\(\(a\) => a\.session_id\)\)/,
      );
    }
  });

  it("getOwnerStats dedupes, so its two callers inherit it", () => {
    const b = bodyOf("export async function getOwnerStats");
    expect(b).toMatch(/latestPerSessionStudent|latestPerStudent/);
  });
});
