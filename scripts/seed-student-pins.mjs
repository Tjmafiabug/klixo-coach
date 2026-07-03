// One-off seed: give every active student a portal PIN (col H "pin_hash" on the
// Students tab). Student's phone OR parent_phone + this PIN logs into the portal.
// Run: node --env-file=.env.local scripts/seed-student-pins.mjs
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";
import bcrypt from "bcryptjs";

const DEMO_PIN = "1234";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const authClient = new googleAuth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = sheetsApi({ version: "v4", auth: authClient });
const spreadsheetId = process.env.SHEET_ID;

const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Students" });
const rows = res.data.values ?? [];
if (rows.length === 0) throw new Error("Students tab is empty — aborting.");
const header = rows[0];
const body = rows.slice(1);

// pin_hash lives at col H (index 7). Add the header if it's not there yet.
let pinCol = header.indexOf("pin_hash");
if (pinCol === -1) {
  pinCol = 7; // H
  // The Students grid may physically be only 7 columns wide — writing H would
  // exceed the grid limit. Widen it first, then write the header.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find((s) => s.properties.title === "Students");
  const gid = sheet.properties.sheetId;
  const cols = sheet.properties.gridProperties.columnCount ?? 0;
  if (cols < 8) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { appendDimension: { sheetId: gid, dimension: "COLUMNS", length: 8 - cols } },
        ],
      },
    });
    console.log(`Widened Students grid from ${cols} to 8 columns.`);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Students!H1",
    valueInputOption: "RAW",
    requestBody: { values: [["pin_hash"]] },
  });
  console.log("Added 'pin_hash' header at col H.");
}
const colLetter = String.fromCharCode(65 + pinCol); // H

const statusCol = header.indexOf("status");
const hash = bcrypt.hashSync(DEMO_PIN, 10);
// active students get the demo PIN; inactive rows keep whatever's there (no login).
const values = body.map((r) => {
  const active = (r[statusCol] ?? "").trim() === "active";
  return [active ? hash : r[pinCol] ?? ""];
});
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `Students!${colLetter}2:${colLetter}${body.length + 1}`,
  valueInputOption: "RAW",
  requestBody: { values },
});
const seeded = values.filter((v) => v[0] === hash).length;
console.log(`Set portal PIN ${DEMO_PIN} for ${seeded} active students (col ${colLetter}).`);
console.log("Seed done.");
