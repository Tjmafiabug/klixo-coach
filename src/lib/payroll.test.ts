import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ledgerStatus } from "@/lib/data";

/**
 * Payroll arithmetic.
 *
 * due = base(monthly_salary) + Σ active adjustments (signed) − Σ active payments,
 * scoped to one period; the board covers active staff only.
 *
 * The board total is deliberately NOT the sum of the rows: one staffer's credit
 * must not cancel out another's arrears, or an owner reads "₹0 due" while
 * somebody is still owed a salary. That rule lives inside getPayrollBoard's
 * reducer, so it is pinned here by source assertion — the same technique as
 * guards.test.ts, and for the same reason: nothing in the type system expresses
 * it, and a "simplification" would silently drop it.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

/** The reducer that produces the board totals. */
function totalsReducer(): string {
  const fn = SRC.slice(SRC.indexOf("export async function getPayrollBoard"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  return body.slice(body.indexOf("const totals"));
}

describe("payroll board totals", () => {
  it("floors each row's due at zero so credits don't offset arrears", () => {
    const reducer = totalsReducer();
    expect(reducer, "getPayrollBoard's totals reducer not found — was it renamed?").toContain("due:");
    expect(
      reducer,
      "a staffer in credit must not reduce the payroll's total due — keep Math.max(0, r.due)",
    ).toMatch(/due:\s*t\.due\s*\+\s*Math\.max\(0,\s*r\.due\)/);
  });

  it("sums base, adjustments and paid without flooring", () => {
    // Only `due` is floored. Flooring the others would misreport what the
    // centre actually pays out and what it has already paid.
    const reducer = totalsReducer();
    expect(reducer).toMatch(/base:\s*t\.base\s*\+\s*r\.base/);
    expect(reducer).toMatch(/adjustments:\s*t\.adjustments\s*\+\s*r\.adjustments/);
    expect(reducer).toMatch(/paid:\s*t\.paid\s*\+\s*r\.paid/);
  });

  it("computes a row's due as base + adjustments − paid", () => {
    const fn = SRC.slice(SRC.indexOf("export async function getPayrollBoard"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(
      /const due\s*=\s*base\s*\+\s*adjustments\s*-\s*paid/,
    );
  });

  it("shows only active staff on the board", () => {
    // A former employee must not keep appearing in payroll.
    const fn = SRC.slice(SRC.indexOf("export async function getPayrollBoard"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/\.filter\(\(s\) => s\.active === "TRUE"\)/);
  });

  it("counts only active adjustments and payments for the period", () => {
    // A voided salary payment must not still count as paid.
    const fn = SRC.slice(SRC.indexOf("export async function getPayrollBoard"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    const activeChecks = body.match(/status === "active"/g) ?? [];
    expect(activeChecks.length, "both adjustments and payments must be filtered").toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/period === month/);
  });
});

describe("ledgerStatus — shared by fees and payroll", () => {
  it("reports money still owed as due", () => {
    expect(ledgerStatus(15_000)).toBe("due");
  });

  it("reports a settled balance", () => {
    expect(ledgerStatus(0)).toBe("settled");
  });

  it("reports an overpaid staffer as credit, not due", () => {
    // Sign errors here are how a centre pays someone twice.
    expect(ledgerStatus(-2_500)).toBe("credit");
  });
});
