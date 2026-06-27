// One-off seed: set every teacher's PIN to the demo value and ensure
// Config.demo_today exists. Run: node --env-file=.env.local scripts/seed-pins.mjs
import { google } from "googleapis";
import bcrypt from "bcryptjs";

const DEMO_PIN = "1234";
const DEMO_TODAY = "2026-06-24";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SHEET_ID;

// --- Staff: hash the demo PIN into pin_hash (col D) for LOGIN staff only ---
const t = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Staff" });
const rows = t.data.values ?? [];
const header = rows[0];
const pinCol = header.indexOf("pin_hash");
const roleCol = header.indexOf("role");
const body = rows.slice(1);
const hash = bcrypt.hashSync(DEMO_PIN, 10);
// only owner/teacher rows log in; non-teaching staff (role "") keep their cell as-is
const pinValues = body.map((r) => {
  const role = r[roleCol];
  return [role === "owner" || role === "teacher" ? hash : r[pinCol] ?? ""];
});
const colLetter = String.fromCharCode(65 + pinCol); // D
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `Staff!${colLetter}2:${colLetter}${body.length + 1}`,
  valueInputOption: "RAW",
  requestBody: { values: pinValues },
});
const seeded = pinValues.filter((v) => v[0] === hash).length;
console.log(`Set PIN ${DEMO_PIN} for ${seeded} login staff (col ${colLetter}).`);

// --- Config: ensure demo_today ---
const c = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Config" });
const crows = c.data.values ?? [];
const keys = crows.map((r) => r[0]);
if (!keys.includes("demo_today")) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Config",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [["demo_today", DEMO_TODAY]] },
  });
  console.log(`Added Config demo_today=${DEMO_TODAY}.`);
} else {
  console.log("Config demo_today already present.");
}
console.log("Seed done.");
