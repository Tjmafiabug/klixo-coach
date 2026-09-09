import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

/**
 * Auth and role separation — the boundary every other feature sits behind.
 * These drive the real form, so they cover the whole chain: bcrypt compare,
 * JWT mint, cookie flags, and the layout redirects.
 */

test.describe("login", () => {
  test("owner signs in and lands on the dashboard", async ({ page }) => {
    await login(page, "owner");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(USERS.owner.name).first()).toBeVisible();
  });

  test("teacher signs in and lands on today, not the dashboard", async ({ page }) => {
    await login(page, "teacher");
    await expect(page).toHaveURL(/\/today/);
  });

  test("student signs in and lands on the portal", async ({ page }) => {
    await login(page, "student");
    await expect(page).toHaveURL(/\/portal/);
  });

  test("a parent's phone opens the same child's portal", async ({ page }) => {
    // The portal trust boundary: a student's phone and their parent's phone
    // mint tokens scoped to the SAME studentId, so a parent sees their child
    // and only their child.
    await login(page, "parent");
    await expect(page).toHaveURL(/\/portal/);
  });

  test("a wrong PIN is refused without revealing whether the phone exists", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="phone"]', USERS.owner.phone);
    await page.fill('input[name="pin"]', "9999");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid phone or pin/i)).toBeVisible();
    await expect(page, "must not reach the app").toHaveURL(/\/login/);
  });

  test("an unknown phone gets the identical message (no user enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="phone"]', "9000000000");
    await page.fill('input[name="pin"]', "1234");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid phone or pin/i)).toBeVisible();
  });

  test("empty credentials are rejected client-side", async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("session cookie", () => {
  test("is httpOnly, sameSite=lax and scoped to the whole site", async ({ page, context }) => {
    await login(page, "owner");
    const cookie = (await context.cookies()).find((c) => c.name === "klixo_session");
    expect(cookie, "session cookie must be set").toBeDefined();
    // httpOnly is what stops an XSS from stealing the session outright.
    expect(cookie!.httpOnly, "must be httpOnly").toBe(true);
    expect(cookie!.sameSite, "lax blunts cross-site POSTs").toBe("Lax");
    expect(cookie!.path).toBe("/");
    // `secure` is false in dev by design (NODE_ENV !== production over http).
  });

  test("is not readable from JavaScript", async ({ page }) => {
    await login(page, "owner");
    const visible = await page.evaluate(() => document.cookie.includes("klixo_session"));
    expect(visible, "httpOnly means script must not see it").toBe(false);
  });
});

test.describe("logout", () => {
  test("ends the session and bounces back to login", async ({ page }) => {
    await login(page, "owner");
    // The logout control lives in the app shell.
    const logout = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
    await logout.click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await page.goto("/dashboard");
    await expect(page, "the dashboard must not be reachable after logout").toHaveURL(/\/login/);
  });
});

test.describe("unauthenticated access", () => {
  const guarded = ["/dashboard", "/today", "/manage", "/manage/students", "/manage/fees", "/timetable", "/portal"];

  for (const path of guarded) {
    test(`${path} redirects to login when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("a tampered session cookie is rejected", async ({ page, context }) => {
    await login(page, "owner");
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "klixo_session")!;
    // Flip the signature — jwtVerify must reject, and getSession returns null.
    await context.clearCookies();
    await context.addCookies([
      {
        name: session.name,
        value: session.value.slice(0, -6) + "AAAAAA",
        domain: session.domain,
        path: session.path,
        httpOnly: session.httpOnly,
        secure: session.secure,
        sameSite: session.sameSite,
      },
    ]);
    await page.goto("/dashboard");
    await expect(page, "a forged token must not authenticate").toHaveURL(/\/login/);
  });
});
