// One-off seed: give every active student a portal PIN (col H "pin_hash" on the
// Students tab). Student's phone OR parent_phone + this PIN logs into the portal.
//
//   node --env-file=.env.local scripts/seed-student-pins.mjs           # unique PINs
//   node --env-file=.env.local scripts/seed-student-pins.mjs --demo    # all "1234"
//
// Each student gets a DIFFERENT random PIN, printed once for distribution. A
// shared PIN is not a weak default here, it is a data breach: portal login
// accepts a student's phone OR their parent_phone, so one shared PIN lets
// anyone who knows a classmate's number read that family's fees, attendance,
// results and PTM notes. --demo restores the old shared-PIN behaviour for
// demo deployments only, and refuses to touch the production Sheet.
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const DEMO = process.argv.includes("--demo");
const DEMO_PIN = "1234";

if (DEMO && process.env.SHEET_ID && process.env.SHEET_ID === process.env.PROD_SHEET_ID) {
  throw new Error("--demo refuses to run against PROD_SHEET_ID. Drop the flag for unique PINs.");
}

/** Cryptographically random 6-digit PIN. randomInt, not Math.random: these are
 *  credentials, and Math.random is predictable from a few observed outputs. */
const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

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
const nameCol = header.indexOf("name");
const phoneCol = header.indexOf("phone");
const parentCol = header.indexOf("parent_phone");

// Active students get a fresh PIN each; inactive rows keep whatever's there
// (no login). One bcrypt hash per row — deliberately NOT one shared hash.
const issued = [];
const values = body.map((r) => {
  const active = (r[statusCol] ?? "").trim() === "active";
  if (!active) return [r[pinCol] ?? ""];
  const pin = DEMO ? DEMO_PIN : newPin();
  issued.push({
    name: r[nameCol] ?? "",
    phone: r[phoneCol] || r[parentCol] || "",
    pin,
  });
  return [bcrypt.hashSync(pin, 10)];
});

await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `Students!${colLetter}2:${colLetter}${body.length + 1}`,
  valueInputOption: "RAW",
  requestBody: { values },
});

if (DEMO) {
  console.log(`Set the SHARED demo PIN ${DEMO_PIN} for ${issued.length} active students.`);
  console.log("Never do this on a real centre — see the header comment.");
} else {
  console.log(`Set a UNIQUE portal PIN for ${issued.length} active students (col ${colLetter}).\n`);
  console.log("Distribute these, then delete this output. They are not recoverable:");
  console.log("name,phone,pin");
  for (const x of issued) console.log(`${JSON.stringify(x.name)},${x.phone},${x.pin}`);
  console.log(
    "\nStudents can change their own PIN at /portal/profile once they have signed in.",
  );
}
