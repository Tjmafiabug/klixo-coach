import { expect, test, type Page } from "@playwright/test";
import { login, expectPageOk, cleanupTestPayments, E2E_NOTE } from "./helpers";

/**
 * Feature journeys — every screen a real user reaches, plus the two write paths
 * that carry the most consequence (marking a register, recording a payment).
 *
 * These are deliberately tolerant about *content* (the Sheet's data changes) and
 * strict about *reachability and behaviour*: the page renders, the write lands,
 * the number moves in the right direction.
 */

/** Fail the test on any uncaught client error, not just on a bad assertion. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Node deprecation noise from googleapis, surfaced by the dev overlay.
    if (/DeprecationWarning|zlib\.bytesRead/.test(t)) return;
    errors.push(t);
  });
  return errors;
}

test.describe("owner can reach every management screen", () => {
  const pages = [
    "/dashboard", "/today", "/manage", "/manage/students", "/manage/students/new",
    "/manage/batches", "/manage/batches/new", "/manage/staff", "/manage/staff/new",
    "/manage/staff/attendance", "/manage/staff/tasks", "/manage/staff/payroll",
    "/manage/rooms", "/manage/holidays", "/manage/settings", "/manage/fees",
    "/manage/ptm", "/manage/curriculum", "/manage/curriculum/new",
    "/manage/tests", "/manage/tests/new", "/timetable", "/timetable/new", "/new-session",
  ];

  for (const path of pages) {
    test(`${path} renders without a client error`, async ({ page }) => {
      const errors = watchForErrors(page);
      await login(page, "owner");
      await expectPageOk(page, path);
      expect(errors, `${path} logged client errors`).toEqual([]);
    });
  }
});

test.describe("student portal", () => {
  const pages = [
    "/portal", "/portal/attendance", "/portal/fees", "/portal/progress",
    "/portal/timetable", "/portal/tests", "/portal/profile",
  ];

  for (const path of pages) {
    test(`${path} renders for a student`, async ({ page }) => {
      const errors = watchForErrors(page);
      await login(page, "student");
      await expectPageOk(page, path);
      expect(errors, `${path} logged client errors`).toEqual([]);
    });
  }
});

test.describe("attendance", () => {
  test("a teacher marks their own session and the register persists", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/today");

    // The board streams in after the Sheet read (~2s), so counting locators
    // eagerly reports 0 and silently skips the most valuable test in the suite.
    // Wait for the list to actually appear before deciding there is nothing.
    const firstSession = page.locator('a[href^="/mark/"]').first();
    await firstSession.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip((await firstSession.count()) === 0, "no session scheduled for this teacher today");

    await firstSession.click();
    await page.waitForURL(/\/mark\//);
    const markUrl = page.url();

    // Same trap as above: the register renders after its own Sheet read, so
    // wait for a row rather than counting an empty DOM.
    const roster = page.locator('[role="group"][aria-label^="Attendance for"]');
    await roster.first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip((await roster.count()) === 0, "session has an empty roster");

    // Flip the first student to the status they are NOT currently on. Clicking
    // the status already saved is a no-op: writeCount stays 0, the save button
    // renders "No changes" and stays disabled, so the test would click nothing.
    const first = roster.first();
    const wasPresent =
      (await first.locator('button[title="present"]').getAttribute("aria-pressed")) === "true";
    const target = wasPresent ? "absent" : "present";
    await first.locator(`button[title="${target}"]`).click();
    await expect(
      first.locator(`button[title="${target}"]`),
      "the UI must reflect the click before submitting",
    ).toHaveAttribute("aria-pressed", "true");

    // Changing an existing mark requires a reason (the manual-mark audit trail).
    const reason = page.locator('input[placeholder^="Reason"]').first();
    if (await reason.count()) await reason.fill("E2E: verifying the write path");

    // Target the register's own save button by name. `button[type=submit]`
    // .first() is the app shell's "Sign out" — a generic selector here logs the
    // teacher out and the test then "fails" for the wrong reason.
    const save = page.getByRole("button", { name: /^(Submit|Saving…)$/ });
    await expect(save, "a real change must enable the save button").toBeEnabled();
    await save.click();
    // submitMarks redirects to /today on success (?marked= or ?nochange=1).
    await page.waitForURL(/\/today/, { timeout: 30_000 });

    // Re-open the register: the new status must have survived the round trip
    // to the Sheet and back.
    await page.goto(markUrl);
    const saved = page
      .locator('[role="group"][aria-label^="Attendance for"]')
      .first()
      .locator(`button[title="${target}"]`);
    await saved.waitFor({ state: "visible", timeout: 30_000 });
    await expect(saved, "the saved mark must come back from the Sheet").toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a teacher cannot open another teacher's session", async ({ page, browser, baseURL }) => {
    // Collect a session id belonging to teacher A...
    const a = await browser.newContext({ baseURL });
    const aPage = await a.newPage();
    await login(aPage, "teacher");
    await aPage.goto("/today");
    const link = aPage.locator('a[href^="/mark/"]').first();
    await link.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    const href = (await link.count()) ? await link.getAttribute("href") : null;
    await a.close();
    test.skip(!href, "no session available to test cross-teacher access");

    // ...then try to open it as a different teacher.
    await page.goto("/login");
    await page.fill('input[name="phone"]', "9876500003"); // Anjali, T003
    await page.fill('input[name="pin"]', "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/today/);

    await page.goto(href!);
    // mark/[sessionId] restricts a teacher to their own sessions.
    const denied = /\/today/.test(page.url()) || (await page.locator("body").innerText()).includes("404");
    expect(denied, "a teacher must not open a colleague's register").toBe(true);
  });
});

test.describe("fees", () => {
  test("recording a payment reduces the outstanding balance by that amount", async ({ page }) => {
    // The payment form lives on the student's page, not the fees overview
    // (which only generates monthly charges).
    await login(page, "owner");
    await page.goto("/manage/students");
    // Exclude /new — the "Add student" link sorts first and is not a student.
    const studentLink = page
      .locator('a[href^="/manage/students/"]:not([href$="/new"])')
      .first();
    await studentLink.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip((await studentLink.count()) === 0, "no students to bill");
    await studentLink.click();
    await page.waitForURL(/\/manage\/students\/.+/);

    // Two forms on this page carry input[name="amount"] — Record payment and
    // Add charge. Scope to the payment form or fill() hits a strict-mode error.
    const payForm = page.locator("form").filter({ has: page.getByRole("button", { name: /record payment/i }) });
    const amountField = payForm.locator('input[name="amount"]');
    await amountField.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip((await amountField.count()) === 0, "no payment form on the student page");

    /** The ledger figure the page shows, in whole rupees. */
    const outstanding = async (): Promise<number | null> => {
      const body = await page.locator("body").innerText();
      // The ledger renders as a label above its figure: "OUTSTANDING\n\n₹3,000"
      const m = body.match(/OUTSTANDING\s*₹\s?([\d,]+)/i);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    };

    const before = await outstanding();
    test.skip(before === null || before <= 0, "student has nothing outstanding to pay");

    const PAY = 1; // one rupee — enough to move the number, cheap to reconcile
    await amountField.fill(String(PAY));
    await payForm.locator('select[name="method"]').selectOption("cash");
    await payForm.locator('input[name="note"]').fill(E2E_NOTE).catch(() => {});

    // Name the button explicitly — never `button[type=submit]`.first(), which
    // is the shell's "Sign out".
    await page.getByRole("button", { name: /record payment/i }).click();
    await page.waitForURL(/paid=1|\/manage\/students\//, { timeout: 30_000 });

    // Poll rather than assert once. Sheets is not read-after-write consistent:
    // the redirect can re-render before Google serves the row that was just
    // appended, so the first read is occasionally one payment behind. Reloading
    // converges within a second or two — a real property of this datastore, and
    // the reason a single eager assertion here would flake.
    await expect
      .poll(
        async () => {
          const v = await outstanding();
          if (v === before! - PAY) return v;
          await page.reload();
          return outstanding();
        },
        {
          message: `paying ₹${PAY} must reduce outstanding from ₹${before} to ₹${before! - PAY}`,
          timeout: 20_000,
        },
      )
      .toBe(before! - PAY);

    // Clean up out of band. Voiding through the UI is tempting but unsafe here:
    // "Void" buttons sit against charges as well as payments, so picking one by
    // position risks voiding a real ₹1,000 charge instead of this test's ₹1
    // payment. cleanupTestPayments() targets rows by their note text.
    await cleanupTestPayments();
  });
});

test.describe("data integrity surfaces to the owner", () => {
  test("the dashboard renders its integrity banner without crashing", async ({ page }) => {
    // integrityIssues() runs on every dashboard read and now also reports blank
    // teacher assignments and duplicate ids. A malformed row must not 500.
    const errors = watchForErrors(page);
    await login(page, "owner");
    await expectPageOk(page, "/dashboard");
    expect(errors).toEqual([]);
  });
});

test.describe("CSV export", () => {
  const kinds = ["attendance", "defaulters"];
  for (const kind of kinds) {
    test(`${kind} export returns a CSV`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ baseURL });
      const p = await ctx.newPage();
      await login(p, "owner");
      await p.close();
      const res = await ctx.request.get(`/api/export?kind=${kind}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("csv");
      const body = await res.text();
      // Excel needs the BOM to read UTF-8 correctly.
      expect(body.charCodeAt(0), "CSV must start with a UTF-8 BOM").toBe(0xfeff);
      await ctx.close();
    });
  }

  test("an unknown export kind is rejected", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    const p = await ctx.newPage();
    await login(p, "owner");
    await p.close();
    const res = await ctx.request.get("/api/export?kind=../../etc/passwd");
    expect(res.status(), "kind is allow-listed").toBe(400);
    await ctx.close();
  });
});
