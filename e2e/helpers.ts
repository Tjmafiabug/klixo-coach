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
