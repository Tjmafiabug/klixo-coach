import { describe, expect, it } from "vitest";
import { ledgerStatus, monthOverlaps } from "@/lib/data";
import type { Enrollment } from "@/lib/types";

/**
 * Money logic. These two are the exported edges of the fee/payroll path, and
 * both encode a subtlety that a later "tidy-up" would plausibly break.
 */

const enrol = (start: string, end = ""): Enrollment =>
  ({
    enroll_id: "E1",
    student_id: "S1",
    batch_id: "B1",
    start_date: start,
    end_date: end,
    status: "active",
  }) as Enrollment;

describe("monthOverlaps — who gets billed for a period", () => {
  it("bills an enrollment that starts mid-month", () => {
    // The "-99" sentinel is why: it's lexicographically above any real day, so
    // any start date within the month compares as <= period-99. Replacing it
    // with "-31" would silently drop students who joined on the 31st.
    expect(monthOverlaps(enrol("2026-06-15"), "2026-06")).toBe(true);
  });

  it("bills an enrollment starting on the last day of a 31-day month", () => {
    expect(monthOverlaps(enrol("2026-07-31"), "2026-07")).toBe(true);
  });

  it("does not bill an enrollment that starts after the period", () => {
    expect(monthOverlaps(enrol("2026-07-01"), "2026-06")).toBe(false);
  });

  it("does not bill an enrollment that ended before the period", () => {
    expect(monthOverlaps(enrol("2026-01-01", "2026-05-31"), "2026-06")).toBe(false);
  });

  it("bills an enrollment that ends mid-period", () => {
    expect(monthOverlaps(enrol("2026-01-01", "2026-06-10"), "2026-06")).toBe(true);
  });

  it("bills an open-ended enrollment", () => {
    expect(monthOverlaps(enrol("2026-01-01", ""), "2026-06")).toBe(true);
  });

  it("bills an enrollment ending on the first day of the period", () => {
    expect(monthOverlaps(enrol("2026-01-01", "2026-06-01"), "2026-06")).toBe(true);
  });

  it("spans a year boundary correctly", () => {
    expect(monthOverlaps(enrol("2025-12-01", "2026-01-15"), "2026-01")).toBe(true);
    expect(monthOverlaps(enrol("2025-12-01", "2025-12-31"), "2026-01")).toBe(false);
  });
});

describe("ledgerStatus", () => {
  it("reports money owed as due", () => {
    expect(ledgerStatus(4000)).toBe("due");
  });

  it("reports a zero balance as settled", () => {
    expect(ledgerStatus(0)).toBe("settled");
  });

  it("reports an overpayment as credit, not due", () => {
    // Negative outstanding means the centre owes the student. Shared by the
    // fees ledger and payroll, so a sign slip here misreports both.
    expect(ledgerStatus(-500)).toBe("credit");
  });

  it("treats one rupee as due", () => {
    expect(ledgerStatus(1)).toBe("due");
  });

  it("treats minus one rupee as credit", () => {
    expect(ledgerStatus(-1)).toBe("credit");
  });
});
