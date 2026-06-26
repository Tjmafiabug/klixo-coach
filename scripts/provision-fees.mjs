// Provision the two fees tabs in the centre's Google Sheet.
// Idempotent: if a tab already exists its header row is (re-)written; if it
// doesn't exist the tab is created first, then the header is written.
//
// Run (DO NOT execute automatically — the orchestrator runs this once against
// the live Sheet before the reader code deploys):
//   node --env-file=.env.local scripts/provision-fees.mjs

import { google } from "googleapis";

// Header arrays kept in sync with types.ts FEE_CHARGES_HEADER / PAYMENTS_HEADER
const FEE_CHARGES_HEADER = [
  "charge_id",
  "student_id",
  "batch_id",
  "period",
  "kind",
  "amount",
  "note",
  "status",
  "created",
];

const PAYMENTS_HEADER = [
  "payment_id",
  "student_id",
  "amount",
  "date",
  "method",
  "note",
  "timestamp",
  "status",
];

const TABS = [
  { name: "FeeCharges", header: FEE_CHARGES_HEADER },
  { name: "Payments",   header: PAYMENTS_HEADER },
];

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SHEET_ID;

// Fetch current sheet metadata to check which tabs already exist.
const meta = await sheets.spreadsheets.get({ spreadsheetId });
const existingTitles = new Set(
  (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
);

for (const { name, header } of TABS) {
  if (!existingTitles.has(name)) {
    // Tab is absent — create it via batchUpdate addSheet.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: name },
            },
          },
        ],
      },
    });
    console.log(`Created tab: ${name}`);
  } else {
    console.log(`Tab already exists: ${name}`);
  }

  // (Re-)write row 1 with the header so the tab is always in the correct state.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${name}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
  console.log(`Header written to ${name}: [${header.join(", ")}]`);
}

console.log("provision-fees done.");
