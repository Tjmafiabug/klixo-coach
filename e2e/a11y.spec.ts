import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Accessibility, as a regression gate.
 *
 * Automated scanning catches roughly a third of WCAG criteria — it cannot judge
 * whether alt text is meaningful or an interaction makes sense. So this is a
 * ratchet, not a compliance claim: the pages listed here are clean today, and
 * this keeps them clean.
 *
 * Fails on `serious` and `critical` only. Including `moderate`/`minor` produces
 * enough noise that the whole check gets disabled within a fortnight, which is
 * worse than a narrower gate that stays on.
 *
 * These four were all real, found by running this against the live app:
 *   - the /today date input had no accessible name (critical)
 *   - an animation wrapper <div> sat between <ul> and <li>, so screen readers
 *     stopped announcing "list, N items"
 *   - disabled pagination sat at 1.7:1 contrast against a required 4.5:1
 *   - the dashboard's scrollable lists were unreachable by keyboard
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return blocking.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    example: v.nodes[0]?.html?.slice(0, 120),
  }));
}

test.describe("accessibility (serious + critical)", () => {
  const staffPages = ["/today", "/dashboard", "/manage", "/manage/students", "/timetable"];

  for (const path of staffPages) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await login(page, "owner");
      const found = await scan(page, path);
      expect(found, `${path}:\n${JSON.stringify(found, null, 2)}`).toEqual([]);
    });
  }

  const portalPages = ["/portal", "/portal/attendance", "/portal/fees"];

  for (const path of portalPages) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      // Parents reach these on cheap Android phones, often not in their first
      // language — the portal is where accessibility matters most here.
      await login(page, "student");
      const found = await scan(page, path);
      expect(found, `${path}:\n${JSON.stringify(found, null, 2)}`).toEqual([]);
    });
  }

  test("/login has no serious or critical violations", async ({ page }) => {
    // The one page every user must get through.
    const found = await scan(page, "/login");
    expect(found, `/login:\n${JSON.stringify(found, null, 2)}`).toEqual([]);
  });
});
