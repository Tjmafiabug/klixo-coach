// Provision the unified Staff tab in the centre's Google Sheet.
//
// What it does (idempotent, data-safe — only renames the tab + rewrites row 1):
//   1. Renames the "Teachers" tab -> "Staff" (only if "Teachers" exists and
//      "Staff" doesn't). If "Staff" already exists, leaves it as-is.
//   2. (Re-)writes the header row to the full A..M Staff schema, adding the new
//      columns (staff_type, designation, department, join_date, monthly_salary,
//      notes). Existing rows keep their A..G values; the new columns read as ""
//      which the app treats as a teaching staffer (legacy default).
//
// Run (DO NOT execute automatically — run once against the live Sheet before
// the new reader code serves traffic):
//   node --env-file=.env.local scripts/provision-staff.mjs

import { google } from "googleapis";

// Kept in sync with the Staff interface in src/lib/types.ts (columns A..M).
const STAFF_HEADER = [
  "teacher_id",     // A  PK (T### teaching, S### non-teaching) — name kept for FK compatibility
  "name",           // B
  "phone",          // C
  "pin_hash",       // D
  "role",           // E  "" | teacher | owner
  "subjects",       // F
  "active",         // G  TRUE | FALSE
  "staff_type",     // H  teaching | non_teaching ("" = teaching)
  "designation",    // I
  "department",     // J
  "join_date",      // K  YYYY-MM-DD
  "monthly_salary", // L
  "notes",          // M
];

const OLD_NAME = "Teachers";
const NEW_NAME = "Staff";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SHEET_ID;

const meta = await sheets.spreadsheets.get({ spreadsheetId });
const byTitle = new Map(
  (meta.data.sheets ?? []).map((s) => [s.properties?.title ?? "", s.properties]),
);

if (!byTitle.has(NEW_NAME) && byTitle.has(OLD_NAME)) {
  // Rename Teachers -> Staff (preserves the sheetId, so every FK by row stays).
  const sheetId = byTitle.get(OLD_NAME).sheetId;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, title: NEW_NAME },
            fields: "title",
          },
        },
      ],
    },
  });
  console.log(`Renamed tab: ${OLD_NAME} -> ${NEW_NAME}`);
} else if (byTitle.has(NEW_NAME)) {
  console.log(`Tab already exists: ${NEW_NAME}`);
} else {
  // Neither tab exists — create a fresh Staff tab.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: NEW_NAME } } }] },
  });
  console.log(`Created tab: ${NEW_NAME}`);
}

// (Re-)write row 1 with the full header (A..M). Columns A..G keep their names,
// so existing data rows are untouched; H..M are added.
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `'${NEW_NAME}'!A1:M1`,
  valueInputOption: "RAW",
  requestBody: { values: [STAFF_HEADER] },
});
console.log(`Header written to ${NEW_NAME}: [${STAFF_HEADER.join(", ")}]`);

console.log("provision-staff done.");
