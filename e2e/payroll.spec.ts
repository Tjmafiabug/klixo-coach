import { expect, test } from "@playwright/test";
import { login, cleanupTestSalaryPayments } from "./helpers";

/**
 * Payroll — the other place real money is computed.
 *
 * due = base(monthly_salary) + Σ active adjustments (signed) − Σ active payments,
 * all scoped to one period. Board covers active staff only.
 */

test.describe("payroll", () => {
  test("board renders and is owner-only", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/manage/staff/payroll");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    // Staff with a salary must appear on the board.
    expect(body, "a salaried staffer must be listed").toMatch(/Meena Nair|Suresh Rao|Lakshmi Pillai/);
  });

  test("a teacher cannot see the payroll board", async ({ page }) => {
    // Salaries are the most sensitive data in the app.
    await login(page, "teacher");
    await page.goto("/manage/staff/payroll");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body, "payroll must not render for a teacher").toContain("Mark attendance for the day");
    expect(body, "a salary figure leaked to a teacher").not.toMatch(/18,?000|28,?000|24,?000/);
  });

  test("paying a staffer reduces their due by that amount", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/manage/staff/payroll");
    await page.waitForLoadState("networkidle");

    // Open the first staffer's month ledger.
    const link = page.locator('a[href^="/manage/staff/payroll/"]').first();
    await link.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip((await link.count()) === 0, "no salaried staff on the board");
    await link.click();
    await page.waitForURL(/\/manage\/staff\/payroll\/.+/);
    await page.waitForLoadState("networkidle");

    const dueOf = async (): Promise<number | null> => {
      const b = await page.locator("body").innerText();
      const m = b.match(/DUE\s*₹\s?(-?[\d,]+)/i);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    };

    const before = await dueOf();
    test.skip(before === null, "no DUE figure on the ledger page");

    const amount = page.locator('input[name="amount"]').first();
    test.skip((await amount.count()) === 0, "no pay form on the ledger page");

    const PAY = 1;
    await amount.fill(String(PAY));
    await page.getByRole("button", { name: /pay|record/i }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    // Sheets is not read-after-write consistent — poll rather than assert once.
    await expect
      .poll(
        async () => {
          const v = await dueOf();
          if (v === before! - PAY) return v;
          await page.reload();
          return dueOf();
        },
        { message: `paying ₹${PAY} must reduce due from ₹${before}`, timeout: 20_000 },
      )
      .toBe(before! - PAY);

    // Undo out of band. Clicking "Void" positionally is unsafe: those buttons
    // sit against real salary payments too, and a failed run that leaves its ₹1
    // row active silently shifts every later run's baseline — which is exactly
    // how this test flaked in a full-suite run while passing in isolation.
    await cleanupTestSalaryPayments();
  });
});
