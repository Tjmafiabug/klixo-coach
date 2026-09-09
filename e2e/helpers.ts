import { expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";

/**
 * Seeded logins (scripts/seed-pins.mjs / seed-student-pins.mjs).
 * A student's own phone and their parent's phone mint the SAME session, scoped
 * to that one studentId — that's the portal's trust boundary.
 */
export const USERS = {
  owner: { phone: "9876500001", pin: "1234", name: "Priya Menon", home: "/dashboard" },
  teacher: { phone: "9876500002", pin: "1234", name: "Rajesh", home: "/today" },
  student: { phone: "9876510001", pin: "1234", home: "/portal" },
  parent: { phone: "9876410001", pin: "1234", home: "/portal" },
} as const;

export type Role = keyof typeof USERS;

/** Log in through the real form and land on the role's home page. */
export async function login(page: Page, role: Role): Promise<void> {
  const u = USERS[role];
  await page.goto("/login");
  await page.fill('input[name="phone"]', u.phone);
  await page.fill('input[name="pin"]', u.pin);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${u.home}`, { timeout: 30_000 });
}

/** A request context carrying `role`'s session cookie, for calling endpoints
 *  directly — the way an attacker would, bypassing the UI and its layouts. */
export async function sessionRequest(
  browser: Browser,
  baseURL: string,
  role: Role,
): Promise<{ request: APIRequestContext; dispose: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await login(page, role);
  await page.close();
  const request = ctx.request;
  return { request, dispose: () => ctx.close() };
}

/** Assert a page is reachable and actually rendered (not an error boundary). */
export async function expectPageOk(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} should render`).toBeLessThan(400);
  await expect(page.locator("body")).not.toContainText("Application error");
}

/** Marker written into the note of every payment an E2E test creates. */
export const E2E_NOTE = "E2E test payment";

/**
 * Void the payment rows this suite created, by their note text.
 *
 * The Sheet is the real database with no transactions and no rollback, so a
 * test that writes must undo its own row or the ledger drifts a little further
 * on every run — and the next run then starts from a different balance, which
 * looks exactly like flakiness.
 *
 * Voids rather than deletes: that's what the app itself does (soft-void in
 * column H), so the row stays auditable and row indices don't shift.
 */
export async function cleanupTestPayments(): Promise<number> {
  const { sheets: sheetsApi, auth: googleAuth } = await import("@googleapis/sheets");
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new googleAuth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const api = sheetsApi({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_ID!;

  const res = await api.spreadsheets.values.get({ spreadsheetId, range: "'Payments'" });
  const rows = res.data.values ?? [];
  // Payments columns: A payment_id, B student_id, C amount, D date, E method,
  // F note, G timestamp, H status.
  const data: { range: string; values: string[][] }[] = [];
  rows.slice(1).forEach((r, i) => {
    if (String(r[5] ?? "").includes(E2E_NOTE) && r[7] !== "void") {
      data.push({ range: `Payments!H${i + 2}`, values: [["void"]] });
    }
  });
  if (data.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data },
    });
  }
  return data.length;
}

/**
 * Void the ₹1 salary payments this suite creates.
 *
 * Same reasoning as cleanupTestPayments: the Sheet has no rollback, so a test
 * that writes must undo its own row. Targets by amount + period rather than by
 * clicking "Void" in the UI — those buttons sit against real salary payments
 * too, and picking one by position risks voiding a genuine ₹10,000 payout.
 */
export async function cleanupTestSalaryPayments(): Promise<number> {
  const { sheets: sheetsApi, auth: googleAuth } = await import("@googleapis/sheets");
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new googleAuth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const api = sheetsApi({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_ID!;

  const res = await api.spreadsheets.values.get({ spreadsheetId, range: "'SalaryPayments'" });
  const rows = res.data.values ?? [];
  // SalaryPayments: A pay_id, B staff_id, C period, D amount, E date, F method,
  // G note, H timestamp, I status.
  const data: { range: string; values: string[][] }[] = [];
  rows.slice(1).forEach((r, i) => {
    if (String(r[3] ?? "") === "1" && r[8] !== "void") {
      data.push({ range: `SalaryPayments!I${i + 2}`, values: [["void"]] });
    }
  });
  if (data.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data },
    });
  }
  return data.length;
}
