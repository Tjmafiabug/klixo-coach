/**
 * Refuse to run against a production Sheet.
 *
 * These tests write real rows — attendance, payments, students. The Sheet is
 * the database, there are no transactions, and there is no undo. So the guard
 * is opt-out-proof: set PROD_SHEET_ID in .env.local to the live centre's Sheet
 * and the run aborts the moment SHEET_ID matches it.
 *
 * Deliberately fails CLOSED on a missing SHEET_ID too — a run against an
 * unconfigured environment is a run whose failures mean nothing.
 */
export default function globalSetup(): void {
  const sheetId = process.env.SHEET_ID;
  const prodSheetId = process.env.PROD_SHEET_ID;

  if (!sheetId) {
    throw new Error(
      "SHEET_ID is not set. E2E needs a Sheet with disposable data — copy .env.example to .env.local.",
    );
  }

  if (prodSheetId && sheetId === prodSheetId) {
    throw new Error(
      `Refusing to run E2E against the production Sheet (${sheetId.slice(0, 8)}…).\n` +
        "These tests write attendance, payments and students, and the Sheet has no undo.\n" +
        "Point SHEET_ID at a copy (File → Make a copy) before running.",
    );
  }

  if (!prodSheetId) {
    // Not fatal — most installs have no production Sheet yet — but say it once,
    // because the guard above can only protect you if it knows what to protect.
    console.warn(
      "\n[e2e] PROD_SHEET_ID is not set, so the production-Sheet guard is inactive.\n" +
        "      Once a real centre is live, set it in .env.local so these tests can never touch it.\n",
    );
  }
}
