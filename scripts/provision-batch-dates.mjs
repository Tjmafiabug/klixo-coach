// Add the two batch-date columns to the Batches tab: start_date, expected_end_date.
// Idempotent: only appends header cells that are missing; never reorders or
// clears existing data. Existing batch rows simply get empty values for the new
// columns (empty = open-ended), which the reader treats as "no cap".
//
// Run (DO NOT execute automatically — run once against the live Sheet before
// relying on the new columns):
//   node --env-file=.env.local scripts/provision-batch-dates.mjs

import { google } from "googleapis";

const NEW_COLUMNS = ["start_date", "expected_end_date"];
const TAB = "Batches";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SHEET_ID;

const colA1 = (i) => {
  // 0-based column index -> A1 letter (A, B, ... Z, AA, ...)
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// Find the tab's numeric sheetId + current grid width.
const meta = await sheets.spreadsheets.get({ spreadsheetId });
const sheet = meta.data.sheets.find((s) => s.properties.title === TAB);
if (!sheet) throw new Error(`Tab '${TAB}' not found`);
const sheetId = sheet.properties.sheetId;
const colCount = sheet.properties.gridProperties.columnCount;

const { data } = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: `'${TAB}'!1:1`,
});
const header = (data.values?.[0] ?? []).map(String);
console.log(`Current ${TAB} header (${header.length} cols, grid width ${colCount}):`, header.join(", "));

const missing = NEW_COLUMNS.filter((c) => !header.includes(c));
if (missing.length === 0) {
  console.log("Nothing to do — both columns already present.");
  process.exit(0);
}

// Widen the grid first if the physical columns don't exist yet.
const needCols = header.length + missing.length;
if (colCount < needCols) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { appendDimension: { sheetId, dimension: "COLUMNS", length: needCols - colCount } },
      ],
    },
  });
  console.log(`Widened grid by ${needCols - colCount} column(s).`);
}

const startCol = colA1(header.length);
const endCol = colA1(header.length + missing.length - 1);
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `'${TAB}'!${startCol}1:${endCol}1`,
  valueInputOption: "RAW",
  requestBody: { values: [missing] },
});
console.log(`Added column(s) [${missing.join(", ")}] at ${startCol}1:${endCol}1. Done.`);
