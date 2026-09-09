import { expect, test } from "@playwright/test";
import { cleanupTestAttempt } from "./helpers";

/**
 * MCQ tests, end to end.
 *
 * Scoring is unit-tested (scoring.test.ts); this covers the parts that only
 * exist in the running app: that a student can actually take a published test,
 * that the score they see matches what they answered, and that the correct
 * answers are never sent to the browser before submission.
 *
 * The flow is deliberately one attempt per student, so each test cleans up its
 * own attempt or it burns that student for every later run.
 */

const TEST_ID = "TST0001";
// A student enrolled in the test's batch who has not attempted it.
const STUDENT = { id: "S003", phone: "9876510003", pin: "1234" };
// Correct answers for TST0001's three questions, from the Questions tab.
const CORRECT = ["C", "D", "A"];

/** Sign in as a specific student (helpers.login only knows the fixed roles). */
async function loginAs(page: import("@playwright/test").Page, phone: string) {
  await page.goto("/login");
  await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="pin"]', STUDENT.pin);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/portal", { timeout: 30_000 });
}

test.describe("MCQ", () => {
  test.afterEach(async () => {
    // Always, even on failure — a stranded attempt makes the next run skip.
    await cleanupTestAttempt(TEST_ID, STUDENT.id);
  });

  test("a student takes a test and sees a score matching their answers", async ({ page }) => {
    await loginAs(page, STUDENT.phone);
    await page.goto(`/portal/tests/${TEST_ID}`);
    await page.waitForLoadState("networkidle");

    const questions = page.locator("ol > li");
    const count = await questions.count();
    test.skip(count === 0, "test has no questions, or the student already attempted it");
    expect(count, "TST0001 has three questions").toBe(CORRECT.length);

    // Answer every question correctly. The radios are sr-only, so click the
    // label that wraps them.
    for (let i = 0; i < count; i++) {
      // The key is its own <span> inside the label ("C" in "C 12"); matching on
      // the label text alone would also hit the option's body text.
      await questions
        .nth(i)
        .locator("label")
        .filter({ has: page.locator(`span:text-is("${CORRECT[i]}")`) })
        .first()
        .click();
    }

    await page.getByRole("button", { name: /^Submit test$/ }).click();

    // Submitting redirects back to the SAME url, so waitForURL returns
    // instantly and reads the un-graded page. Wait for the score itself —
    // all correct, 1 mark each, so full marks.
    const score = new RegExp(`${CORRECT.length}\\s*/\\s*${CORRECT.length}`);
    await expect
      .poll(async () => (await page.locator("body").innerText()).match(score)?.[0] ?? null, {
        message: "the graded result must show full marks",
        // Submitting writes an Attempt plus one Answer row per question, then
        // re-reads to grade — ~8s against a live Sheet, slower under quota
        // pressure.
        timeout: 60_000,
      })
      .not.toBeNull();
  });

  test("the correct answers are never sent to the browser before submitting", async ({ page }) => {
    // getTestForTaking strips `correct` from the payload — otherwise the answer
    // key sits in the HTML of the page the student is being examined on.
    await loginAs(page, STUDENT.phone);
    const res = await page.goto(`/portal/tests/${TEST_ID}`);
    const html = (await res?.text()) ?? "";
    await page.waitForLoadState("networkidle");

    const questions = await page.locator("ol > li").count();
    test.skip(questions === 0, "student already attempted this test");

    // The answer key would appear as a `correct` field on the question objects
    // in the RSC payload.
    expect(html, "the answer key must not reach the client").not.toMatch(/"correct"\s*:\s*"[A-D]"/);
  });

  test("a student cannot take the same test twice", async ({ page }) => {
    // Two page loads plus a submit that writes 1 Attempt + N Answer rows and
    // re-reads to grade — past the 60s default against a live Sheet.
    test.setTimeout(120_000);

    await loginAs(page, STUDENT.phone);
    await page.goto(`/portal/tests/${TEST_ID}`);
    await page.waitForLoadState("networkidle");

    const submit = page.getByRole("button", { name: /^Submit test$/ });
    test.skip((await submit.count()) === 0, "student has already attempted this test");

    // Answer one question and submit.
    await page.locator("ol > li").first().locator("label").first().click();
    await submit.click();

    // The graded result replaces the form. submitAttempt refuses a second
    // attempt server-side; the page must not invite one either, before or
    // after a reload.
    await expect(submit, "the form must be replaced by the result").toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(page.locator("body")).toContainText(/Your result/i);

    await page.goto(`/portal/tests/${TEST_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /^Submit test$/ }),
      "a completed test must not offer a second attempt after a reload",
    ).toHaveCount(0);
    await expect(page.locator("body")).toContainText(/Your result/i);
  });
});
