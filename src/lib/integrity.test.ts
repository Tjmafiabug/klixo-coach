import { describe, expect, it } from "vitest";
import { integrityIssues } from "@/lib/data";
import type { Batch, Enrollment, Room, Session, Staff, Student, TimetableRule } from "@/lib/types";

/**
 * The Sheet is the database AND a document humans edit — that's the product's
 * premise, so bad rows are an operating condition, not an exception. This scan
 * is the only thing that surfaces them (it renders as a dashboard banner).
 *
 * It covers two failure sources: a person editing cells directly, and
 * nextId()'s max-suffix+1 racing under concurrent writes, which Sheets will
 * happily accept because it has no unique constraint.
 */

const empty = {
  sessions: [] as Session[],
  enrolls: [] as Enrollment[],
  batches: [] as Batch[],
  rooms: [] as Room[],
  teachers: [] as Staff[],
  students: [] as Student[],
  rules: [] as TimetableRule[],
};

const session = (o: Partial<Session>): Session =>
  ({ session_id: "SES1", date: "2026-06-24", batch_id: "B1", start: "10:00", end: "11:00", room_id: "R1", teacher_id: "T1", status: "scheduled", source: "recurring", ...o }) as Session;
const batch = (id: string): Batch => ({ batch_id: id, name: id }) as Batch;
const room = (id: string): Room => ({ room_id: id, name: id }) as Room;
const staff = (id: string): Staff => ({ teacher_id: id, name: id }) as Staff;
const student = (id: string): Student => ({ student_id: id, name: id }) as Student;

const details = (i: { detail: string }[]) => i.map((x) => x.detail);

describe("integrityIssues — dangling references", () => {
  it("passes a consistent sheet", () => {
    expect(
      integrityIssues({
        ...empty,
        sessions: [session({})],
        batches: [batch("B1")],
        rooms: [room("R1")],
        teachers: [staff("T1")],
      }),
    ).toEqual([]);
  });

  it("flags a session pointing at a deleted batch", () => {
    const out = integrityIssues({ ...empty, sessions: [session({})], rooms: [room("R1")], teachers: [staff("T1")] });
    expect(details(out)).toContain("SES1 → missing batch B1");
  });

  it("flags a session pointing at a deleted teacher", () => {
    const out = integrityIssues({ ...empty, sessions: [session({})], batches: [batch("B1")], rooms: [room("R1")] });
    expect(details(out)).toContain("SES1 → missing teacher T1");
  });

  it("ignores cancelled sessions", () => {
    // A cancelled session keeps stale refs on purpose — it's history.
    const out = integrityIssues({ ...empty, sessions: [session({ status: "cancelled", batch_id: "GONE" })] });
    expect(out).toEqual([]);
  });

  it("flags an enrollment orphaned from its student", () => {
    const out = integrityIssues({
      ...empty,
      enrolls: [{ enroll_id: "E1", student_id: "GONE", batch_id: "B1" } as Enrollment],
      batches: [batch("B1")],
    });
    expect(details(out)).toContain("E1 → missing student GONE");
  });
});

describe("integrityIssues — unassigned teacher", () => {
  it("flags a session with a blank teacher", () => {
    // Previously invisible: the dangling-ref check skips empty ids. But a blank
    // teacher_id is what let a student pass an ownership comparison (see
    // authz.test.ts), so it must not stay silent.
    const out = integrityIssues({
      ...empty,
      sessions: [session({ teacher_id: "" })],
      batches: [batch("B1")],
      rooms: [room("R1")],
    });
    expect(details(out)).toContain("SES1 → no teacher assigned");
  });

  it("does not flag a cancelled session with no teacher", () => {
    const out = integrityIssues({ ...empty, sessions: [session({ teacher_id: "", status: "cancelled" })] });
    expect(out).toEqual([]);
  });
});

describe("integrityIssues — duplicate ids", () => {
  it("flags two sessions sharing an id", () => {
    const out = integrityIssues({
      ...empty,
      sessions: [session({}), session({})],
      batches: [batch("B1")],
      rooms: [room("R1")],
      teachers: [staff("T1")],
    });
    expect(details(out)).toContain("duplicate id SES1");
  });

  it("reports a repeated id once, not once per extra row", () => {
    const out = integrityIssues({
      ...empty,
      students: [student("S1"), student("S1"), student("S1")],
    });
    expect(details(out).filter((d) => d === "duplicate id S1")).toHaveLength(1);
  });

  it("catches duplicates across every keyed tab", () => {
    const out = integrityIssues({
      ...empty,
      students: [student("S1"), student("S1")],
      batches: [batch("B1"), batch("B1")],
      teachers: [staff("T1"), staff("T1")],
      rooms: [room("R1"), room("R1")],
      enrolls: [
        { enroll_id: "E1", student_id: "S1", batch_id: "B1" } as Enrollment,
        { enroll_id: "E1", student_id: "S1", batch_id: "B1" } as Enrollment,
      ],
    });
    expect(details(out)).toEqual(
      expect.arrayContaining([
        "duplicate id S1",
        "duplicate id B1",
        "duplicate id T1",
        "duplicate id R1",
        "duplicate id E1",
      ]),
    );
  });

  it("does not treat repeated blank ids as duplicates", () => {
    // Trailing/blank rows are a normal Sheet artifact, not a key collision.
    const out = integrityIssues({ ...empty, students: [student(""), student("")] });
    expect(details(out)).not.toContain("duplicate id ");
  });
});
