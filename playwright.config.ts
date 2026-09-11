import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

// Playwright doesn't read .env.local the way `next dev` does, and global-setup
// needs SHEET_ID to enforce the production-Sheet guard.
try {
  loadEnvFile(".env.local");
} catch {
  // absent in CI, where the env comes from the runner
}

// Point the suite at the disposable Sheet, so `npm run e2e` never writes to
// whichever Sheet the app itself is using. The dev server Playwright starts
// inherits this.
//
// Fails CLOSED on purpose. A conditional `if (E2E_SHEET_ID)` reads as harmless
// but defaults to SHEET_ID when the variable is missing or misspelled — and
// SHEET_ID is routinely the production Sheet during local development. A typo
// in a variable name should not silently point a suite that appends payments
// and deletes rows at real data.
const e2eSheet = process.env.E2E_SHEET_ID;
if (!e2eSheet) {
  throw new Error(
    "E2E_SHEET_ID is not set. These tests write real rows, so they refuse to " +
      "fall back to SHEET_ID (which is usually the production Sheet).\n" +
      "Make a copy of the centre Sheet, share it with the service account as " +
      "Editor, and put its id in .env.local — see docs/TESTING.md.",
  );
}
if (e2eSheet === process.env.PROD_SHEET_ID) {
  throw new Error(
    `E2E_SHEET_ID must not be the production Sheet (${e2eSheet.slice(0, 8)}…). ` +
      "Point it at a disposable copy.",
  );
}
process.env.SHEET_ID = e2eSheet;

/**
 * E2E against a real dev server and a real Sheet.
 *
 * The Sheet is the database, and these tests WRITE to it (marking attendance,
 * recording payments). That is only acceptable against a Sheet holding fake
 * data — global-setup.ts refuses to run if PROD_SHEET_ID says otherwise.
 *
 * Serial by design: one Google Sheet is a single mutable global with no
 * transactions and a ~60 reads/min quota. Parallel workers would corrupt each
 * other's fixtures and exhaust the quota, then look like flakiness.
 */
// 3000 is Next's default; set E2E_PORT when another project already holds it
// (the webServer below reuses a running dev server rather than starting one).
const PORT = process.env.E2E_PORT ?? "3000";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One worker, no parallelism — see above.
  workers: 1,
  fullyParallel: false,
  // Fail the run if a .only is committed.
  forbidOnly: !!process.env.CI,
  // Retry in CI only. Locally a flake must be felt, not papered over.
  retries: process.env.CI ? 2 : 0,
  // Sheets round trips are ~0.5-2.5s; the default 5s expect timeout is too tight.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse a dev server if one is already up; otherwise start one.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
