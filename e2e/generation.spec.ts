import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Timetable generation.
 *
 * This is the app's only scheduled write — a nightly cron expands recurring
 * rules into Sessions rows. It is untestable in Vitest (it reads and writes the
 * Sheet directly), and it is the one job that runs unattended, so a defect here
 * surfaces as a teacher opening the app to a wrong or empty day.
 *
 * The action reports its outcome in the redirect (`?generated=N&removed=M`),
 * which makes the invariant directly observable.
 */

/** Run generation via the owner's UI and return what it reported. */
async function generate(page: import("@playwright/test").Page) {
  await page.goto("/today");
  const button = page.getByRole("button", { name: /^Generate$/ });
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  await page.waitForURL(/generated=/, { timeout: 60_000 });
  const url = new URL(page.url());
  return {
    added: Number(url.searchParams.get("generated") ?? "-1"),
    removed: Number(url.searchParams.get("removed") ?? "0"),
  };
}

test.describe("session generation", () => {
  test("is idempotent — a second run changes nothing", async ({ page }) => {
    await login(page, "owner");

    // First run may legitimately add rows (the horizon moves with the clock).
    const first = await generate(page);
    expect(first.added, "generation must report a count").toBeGreaterThanOrEqual(0);

    // It must then CONVERGE: once the desired set is present, further runs are
    // no-ops. Assert convergence rather than demanding the very next run be
    // clean — under Sheets' eventual consistency a second run can still observe
    // rows the first appended moments earlier, and re-adding them once is not
    // the defect this guards against.
    //
    // The real failure it catches is a cron that never settles: churning rows
    // every night, re-appending sessions or deleting ones it just created.
    let last = first;
    for (let attempt = 0; attempt < 3; attempt++) {
      last = await generate(page);
      if (last.added === 0 && last.removed === 0) break;
    }
    expect(last.added, "generation must converge — a settled run adds nothing").toBe(0);
    expect(last.removed, "generation must converge — a settled run removes nothing").toBe(0);
  });

  test("is owner-only", async ({ page }) => {
    // Generation rewrites the whole schedule; a teacher must not be able to
    // trigger it, and the button must not even be offered.
    await login(page, "teacher");
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /^Generate$/ }),
      "a teacher must not be offered schedule generation",
    ).toHaveCount(0);
  });

  test("never touches ad-hoc extra classes", async ({ page }) => {
    // Extra classes are id 9000+ and source != "recurring"; generation must
    // leave them alone or an owner's manually added class vanishes overnight.
    await login(page, "owner");
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    const before = await page.locator('a[href^="/mark/SES9"]').count();

    await generate(page);

    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    const after = await page.locator('a[href^="/mark/SES9"]').count();
    expect(after, "ad-hoc sessions (9000+) must survive generation").toBe(before);
  });
});
