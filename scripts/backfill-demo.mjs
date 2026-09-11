// Backfill demo data so the app looks alive at the real current date.
//
// The seed data stops at 2026-07-24 while `Config.demo_today` froze the app at
// 2026-06-24. Clearing that override without filling the gap leaves every page
// empty. This expands the existing Timetable rules from the last seeded session
// up to today, marks the past ones with a realistic spread, and leaves the
// future to the normal cron (HORIZON_DAYS = 30) — so the app behaves exactly as
// it will in production.
//
// Idempotent: existing (slot_id, date) pairs are skipped, so a second run adds
// nothing. Safe to re-run after the clock moves on.
//
//   node --env-file=.env.local scripts/backfill-demo.mjs [--dry]

import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";

const DRY = process.argv.includes("--dry");
const SHEET_ID = process.env.SHEET_ID;
const SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SHEET_ID || !SA) {
  console.error("Set SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON (see .env.example).");
  process.exit(1);
}
if (SHEET_ID === process.env.PROD_SHEET_ID && !process.argv.includes("--yes-prod")) {
  console.error(
    "SHEET_ID is PROD_SHEET_ID. This writes demo rows — pass --yes-prod if that is really intended.",
  );
  process.exit(1);
}

const auth = new googleAuth.GoogleAuth({
  credentials: JSON.parse(SA),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const api = sheetsApi({ version: "v4", auth });

const TZ = process.env.CENTER_TZ ?? "Asia/Kolkata";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// Same helpers the app uses, so the rows it produces are indistinguishable
// from generated ones.
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowOf = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const read = async (tab) => {
  const r = await api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'` });
  return r.data.values ?? [];
};

const [sessions, rules, holidayRows, attendance, enrolls, batches] = await Promise.all(
  ["Sessions", "Timetable", "Holidays", "Attendance", "Enrollments", "Batches"].map(read),
);

const holidays = new Set(holidayRows.slice(1).map((r) => r[0]));
const batchEnd = new Map(batches.slice(1).map((b) => [b[0], b[9] ?? ""]));

// ---- which (slot, date) pairs already exist -------------------------------
const existing = new Set();
let maxSession = 0;
for (const s of sessions.slice(1)) {
  const n = parseInt(String(s[0]).replace(/\D/g, ""), 10);
  if (!Number.isNaN(n) && n < 9000 && n > maxSession) maxSession = n;
  if (s[8] === "recurring" && s[9]) existing.add(`${s[9]}|${s[1]}`);
}

// Start the day after the last seeded session so history stays continuous.
const lastSeeded = sessions
  .slice(1)
  .map((s) => s[1])
  .filter(Boolean)
  .sort()
  .at(-1);
const from = addDays(lastSeeded, 1);

console.log(`centre today : ${today}`);
console.log(`last session : ${lastSeeded}`);
console.log(`backfilling  : ${from} → ${today}`);

// ---- expand the rules over the gap ----------------------------------------
const newSessions = [];
for (const r of rules.slice(1)) {
  const [slotId, batchId, daysCsv, start, end, roomId, teacherId, effFrom, effTo] = r;
  const days = String(daysCsv).split(",").map((x) => x.trim());
  const bEnd = batchEnd.get(batchId) ?? "";
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (holidays.has(d)) continue;
    if (!days.includes(dowOf(d))) continue;
    if (bEnd && d > bEnd) break;
    if (!(effFrom <= d && (!effTo || effTo >= d))) continue;
    if (existing.has(`${slotId}|${d}`)) continue;
    newSessions.push({
      id: `SES${String(++maxSession).padStart(4, "0")}`,
      date: d, batchId, start, end, roomId, teacherId, slotId,
    });
  }
}
newSessions.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
console.log(`new sessions : ${newSessions.length}`);

// ---- attendance for the ones now in the past ------------------------------
// A realistic spread, and deliberately not uniform: a handful of students sit
// below the 75% threshold so "defaulters" and follow-up streaks have something
// to show. Seeded per (student, session) so re-running is deterministic.
const rosterByBatch = new Map();
for (const e of enrolls.slice(1)) {
  const [, studentId, batchId, startDate, endDate, status] = e;
  if (status === "inactive") continue;
  if (!rosterByBatch.has(batchId)) rosterByBatch.set(batchId, []);
  rosterByBatch.get(batchId).push({ studentId, startDate, endDate: endDate ?? "" });
}

let maxLog = 0;
for (const a of attendance.slice(1)) {
  const n = parseInt(String(a[0]).replace(/\D/g, ""), 10);
  if (!Number.isNaN(n) && n > maxLog) maxLog = n;
}

// Deterministic hash → the same student/session always lands the same way.
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
// Pick a fixed share of chronic absentees so the dashboard's defaulters and
// follow-up lists are never empty. Selecting by hash < threshold looked right
// but produced ZERO for this id set — the values simply never landed in the
// band. Ranking every student by hash and taking the lowest slice is
// deterministic AND guarantees the count.
const allStudentIds = [...new Set(enrolls.slice(1).map((e) => e[1]).filter(Boolean))];
const chronic = new Set(
  allStudentIds
    .map((id) => ({ id, r: hash(`chronic:${id}`) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, Math.max(3, Math.round(allStudentIds.length * 0.08)))
    .map((x) => x.id),
);
const isDefaulter = (studentId) => chronic.has(studentId);

const newAttendance = [];
for (const s of newSessions) {
  if (s.date >= today) continue; // today's classes are still to be marked
  const roster = (rosterByBatch.get(s.batchId) ?? []).filter(
    (e) => e.startDate <= s.date && (e.endDate === "" || e.endDate >= s.date),
  );
  for (const e of roster) {
    const r = hash(`${e.studentId}|${s.id}`);
    // chronic absentees attend ~45% of the time, everyone else ~92%
    const present = isDefaulter(e.studentId) ? r < 0.45 : r < 0.92;
    const late = present && r > 0.86;
    const status = !present ? "absent" : late ? "late" : "present";
    newAttendance.push([
      `A${String(++maxLog).padStart(4, "0")}`,
      s.id, s.date, s.batchId, e.studentId, status, s.teacherId, "app",
      `${s.date}T${s.start}:00+05:30`, "",
    ]);
  }
}
console.log(`new marks    : ${newAttendance.length}`);

if (DRY) {
  console.log("\n--dry: nothing written.");
  console.log("sample session :", JSON.stringify(newSessions[0] ?? null));
  console.log("sample mark    :", JSON.stringify(newAttendance[0] ?? null));
  process.exit(0);
}

if (newSessions.length === 0 && newAttendance.length === 0) {
  console.log("\nNothing to do — already up to date.");
  process.exit(0);
}

// Sessions columns: A id, B date, C batch, D start, E end, F room, G teacher,
// H status, I source, J slot_id.
const sessionRows = newSessions.map((s) => [
  s.id, s.date, s.batchId, s.start, s.end, s.roomId, s.teacherId,
  "scheduled", "recurring", s.slotId,
]);

const append = async (tab, rows) => {
  if (rows.length === 0) return;
  // Chunked: one enormous append risks a payload limit and is slower to retry.
  for (let i = 0; i < rows.length; i += 500) {
    await api.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows.slice(i, i + 500) },
    });
    process.stdout.write(`  ${tab}: ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${tab}: ${rows.length}/${rows.length} done`);
};

await append("Sessions", sessionRows);
await append("Attendance", newAttendance);

// ---- clear the frozen clock ------------------------------------------------
const config = await read("Config");
const idx = config.findIndex((r) => r[0] === "demo_today");
if (idx > 0 && String(config[idx][1] ?? "").trim() !== "") {
  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Config!B${idx + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [[""]] },
  });
  console.log(`\ncleared Config.demo_today (was ${config[idx][1]}) — the app now uses the real date`);
}

console.log("\nDone. Run generation from /today to fill the next 30 days.");
