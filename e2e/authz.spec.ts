import { expect, test } from "@playwright/test";
import { login, sessionRequest, USERS } from "./helpers";

/**
 * Role boundaries, proved from outside the app.
 *
 * guards.test.ts asserts statically that every action calls a guard. This spec
 * is the empirical half: it drives real sessions against real endpoints, so it
 * would catch a guard that exists but doesn't work.
 *
 * The direct-POST tests matter most. actions.ts carries "use server" at file
 * scope, so every export is an independently POST-able endpoint — and layouts
 * do NOT run for a server-action POST. The per-page role checks a browsing user
 * hits are therefore not the boundary; the guard inside the action is.
 */

const OWNER_ONLY = [
  "/dashboard",
  "/manage",
  "/manage/students",
  "/manage/staff",
  "/manage/batches",
  "/manage/fees",
  "/manage/rooms",
  "/manage/holidays",
  "/manage/settings",
  "/manage/curriculum",
  "/manage/tests",
  "/manage/ptm",
  "/timetable",
  "/timetable/new",
  "/new-session",
];

test.describe("teacher cannot reach owner pages", () => {
  for (const path of OWNER_ONLY) {
    test(`${path} bounces a teacher`, async ({ page }) => {
      await login(page, "teacher");
      await page.goto(path);
      // Every owner page repeats `role !== "owner" → redirect("/today")`
      // inline. A page that forgets the line would render here instead.
      await expect(page, `${path} must not render for a teacher`).toHaveURL(/\/today/);
    });
  }
});

test.describe("teacher cannot reach owner-only dynamic routes", () => {
  // The static sweep above covers list pages. These are the :id routes, where a
  // guard is easiest to forget — and where checking the URL alone would lie:
  // after a client-side redirect the address bar keeps the typed path, so the
  // assertion has to be on the CONTENT the teacher actually receives.
  const targets = [
    "/manage/students/S001",
    "/manage/batches/B001",
    "/manage/batches/B001/register",
    "/manage/batches/B001/progress",
    "/manage/staff/T001",
    "/manage/staff/payroll/T001",
    "/manage/rooms/R001",
    "/manage/curriculum/C001",
    "/timetable/SL001",
  ];

  for (const path of targets) {
    test(`${path} shows a teacher no owner data`, async ({ page }) => {
      await login(page, "teacher");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const body = await page.locator("body").innerText();
      // The teacher must land on their own day board, not the owner screen.
      expect(body, `${path} must not render an owner screen`).toContain("Mark attendance for the day");
      // Owner-only chrome that must never appear for a teacher.
      for (const forbidden of ["Record payment", "Add charge", "Reset PIN", "Pay salary", "Deactivate"]) {
        expect(body, `${path} leaked owner control: ${forbidden}`).not.toContain(forbidden);
      }
    });
  }
});

test.describe("student cannot reach the staff app", () => {
  for (const path of ["/today", "/dashboard", "/manage", "/timetable"]) {
    test(`${path} bounces a student to the portal`, async ({ page }) => {
      await login(page, "student");
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal/);
    });
  }
});

test.describe("staff cannot reach the student portal", () => {
  test("owner is redirected off /portal", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("teacher is redirected off /portal", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/today/);
  });
});

test.describe("API routes enforce role", () => {
  test("/api/export is owner-only", async ({ browser, baseURL }) => {
    const owner = await sessionRequest(browser, baseURL!, "owner");
    const teacher = await sessionRequest(browser, baseURL!, "teacher");
    const student = await sessionRequest(browser, baseURL!, "student");
    try {
      const ok = await owner.request.get("/api/export?kind=defaulters");
      expect(ok.status(), "owner may export").toBe(200);

      for (const [role, ctx] of [
        ["teacher", teacher],
        ["student", student],
      ] as const) {
        const res = await ctx.request.get("/api/export?kind=defaulters");
        expect(res.status(), `${role} must not export the defaulters report`).not.toBe(200);
      }
    } finally {
      await Promise.all([owner.dispose(), teacher.dispose(), student.dispose()]);
    }
  });

  test("/api/export refuses an unauthenticated caller", async ({ request }) => {
    const res = await request.get("/api/export?kind=defaulters");
    expect(res.status()).not.toBe(200);
  });

  test("/api/cron/generate refuses a caller without the bearer secret", async ({ request }) => {
    // It fails closed when CRON_SECRET is unset, so 401 either way — the point
    // is that a browser session alone must never trigger generation.
    const res = await request.get("/api/cron/generate");
    expect(res.status(), "cron must not be drivable from the web").toBe(401);
  });

  test("/api/health needs no session", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

test.describe("server actions reject the wrong role when POSTed directly", () => {
  /**
   * Harvest a real action id by watching the request the owner's own UI makes,
   * then replay it with a teacher's cookie. The id is a build-time hash, so it
   * must be captured at runtime rather than hardcoded — and it is obscurity,
   * not a control, which is exactly what this test exists to prove.
   */
  test("a teacher's session cannot drive an owner-only action", async ({ browser, baseURL }) => {
    const ownerCtx = await browser.newContext({ baseURL });
    const ownerPage = await ownerCtx.newPage();
    await login(ownerPage, "owner");

    // Capture the action POST the owner makes when saving a room.
    await ownerPage.goto("/manage/rooms");
    let actionId: string | undefined;
    let actionUrl: string | undefined;
    ownerPage.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (id && req.method() === "POST") {
        actionId = id;
        actionUrl = req.url();
      }
    });

    const name = `E2E Room ${Date.now()}`;
    const nameField = ownerPage.locator('input[name="name"]').first();
    if (await nameField.count()) {
      await nameField.fill(name);
      const capacity = ownerPage.locator('input[name="capacity"]').first();
      if (await capacity.count()) await capacity.fill("10");
      await ownerPage.locator('button[type="submit"]').first().click();
      await ownerPage.waitForTimeout(2500);
    }

    test.skip(!actionId, "no server action observed on /manage/rooms — UI changed?");

    // Now replay that exact endpoint with a TEACHER's cookie.
    const teacherCtx = await browser.newContext({ baseURL });
    const teacherPage = await teacherCtx.newPage();
    await login(teacherPage, "teacher");
    await teacherPage.close();

    const res = await teacherCtx.request.post(actionUrl!, {
      headers: { "next-action": actionId!, "content-type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([{ name: `HACKED ${Date.now()}`, capacity: "99" }]),
      maxRedirects: 0,
    });

    // The redirect target is the oracle: requireOwner() sends a non-owner to
    // /today, while a successful save goes to /manage/rooms?saved=1.
    const location = res.headers()["location"] ?? res.headers()["x-action-redirect"] ?? "";
    const body = await res.text().catch(() => "");
    const deniedByRedirect = /\/today/.test(location) || /\/today/.test(body);
    const notSaved = !/\/manage\/rooms\?saved=1/.test(location) && !/saved=1/.test(body);

    expect(
      deniedByRedirect || notSaved,
      "a teacher POSTing an owner action must be denied, not silently allowed",
    ).toBe(true);

    // And the write must not have landed.
    const roomsPage = await ownerCtx.newPage();
    await roomsPage.goto("/manage/rooms");
    await expect(
      roomsPage.getByText(/HACKED/),
      "the teacher's write must not appear in the Sheet",
    ).toHaveCount(0);

    await Promise.all([ownerCtx.close(), teacherCtx.close()]);
  });

  test("an unauthenticated POST to an action endpoint is refused", async ({ request }) => {
    // No session at all: whatever the action id, this must never mutate.
    const res = await request.post("/manage/rooms", {
      headers: { "next-action": "0000000000000000000000000000000000000000", "content-type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([{ name: "ANON", capacity: "1" }]),
      maxRedirects: 0,
    });
    expect(res.status(), "must not succeed").not.toBe(200);
  });
});

test.describe("portal scoping", () => {
  test("a student sees only their own name on the portal", async ({ page }) => {
    await login(page, "student");
    await page.goto("/portal/profile");
    // Every portal read filters by the studentId inside the token, never a URL.
    await expect(page.locator("body")).not.toContainText(USERS.owner.name);
  });
});
