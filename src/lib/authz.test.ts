import { describe, expect, it } from "vitest";
import { ownsSession } from "./authz";

/**
 * Regression test for a confirmed authorization hole.
 *
 * submitMarks and cancelSession decide ownership by comparing the session's
 * teacher_id with the caller's. A student session carries teacherId "", and
 * readTab maps a cleared or short Sheet cell to "" as well — and the Sheet is
 * human-editable by design, which is the product's whole premise. So a raw
 * `===` meant that blanking one teacher_id cell handed that session to any
 * signed-in student, who can POST the action directly (layouts don't run for
 * server-action POSTs).
 *
 * Guarded twice over: requireStaff() rejects students before this is reached,
 * and this predicate refuses to treat absent ids as a match.
 */

describe("ownsSession", () => {
  it("grants the teacher their own session", () => {
    expect(ownsSession("T001", "T001")).toBe(true);
  });

  it("refuses another teacher's session", () => {
    expect(ownsSession("T001", "T002")).toBe(false);
  });

  it("refuses when the session has no teacher (blanked Sheet cell)", () => {
    expect(ownsSession("", "T001")).toBe(false);
  });

  it("refuses when the caller has no teacher id (a student)", () => {
    expect(ownsSession("T001", "")).toBe(false);
  });

  it("refuses empty-vs-empty — the actual exploit", () => {
    // "" === "" is true. This single case is the bug.
    expect(ownsSession("", "")).toBe(false);
  });
});
