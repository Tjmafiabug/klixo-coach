#!/usr/bin/env node
/**
 * bootstrap-sheet.mjs — create every tab this app needs, with the exact header
 * row, in an empty Google Sheet. Run ONCE when standing up a new centre.
 *
 *   SHEET_ID=... GOOGLE_SERVICE_ACCOUNT_JSON='{...}' node scripts/bootstrap-sheet.mjs
 *   # or, with values already in .env.local:
 *   node --env-file=.env.local scripts/bootstrap-sheet.mjs
 *
 * Idempotent & safe: creates only missing tabs; writes a header row only when a
 * tab's row 1 is empty (never clobbers existing data). Reads are keyed by the
 * header row (see src/lib/sheets.ts readTab), and writes are positional, so the
 * header names + order below are the schema (src/lib/types.ts, PLAN.md §6).
 */
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";

const SHEET_ID = process.env.SHEET_ID;
const SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SHEET_ID || !SA) {
  console.error("Set SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON (see .env.example).");
  process.exit(1);
}

// tab -> header row (field names, in column order). Source of truth: src/lib/types.ts
const TABS = {
  Config:            ["key", "value"],
  Staff:             ["teacher_id", "name", "phone", "pin_hash", "role", "subjects", "active", "staff_type", "designation", "department", "join_date", "monthly_salary", "notes"],
  Students:          ["student_id", "name", "phone", "parent_phone", "join_date", "status", "notes", "pin_hash"],
  Batches:           ["batch_id", "name", "subject", "teacher_id", "room_id", "fee", "level", "active", "start_date", "expected_end_date"],
  Enrollments:       ["enroll_id", "student_id", "batch_id", "start_date", "end_date", "status"],
  Rooms:             ["room_id", "name", "capacity"],
  Timetable:         ["slot_id", "batch_id", "day_of_week", "start", "end", "room_id", "teacher_id", "effective_from", "effective_to"],
  Sessions:          ["session_id", "date", "batch_id", "start", "end", "room_id", "teacher_id", "status", "source", "slot_id"],
  Attendance:        ["log_id", "session_id", "date", "batch_id", "student_id", "status", "marked_by", "method", "timestamp", "reason"],
  Holidays:          ["date", "name"],
  FeeCharges:        ["charge_id", "student_id", "batch_id", "period", "kind", "amount", "note", "status", "created"],
  Payments:          ["payment_id", "student_id", "amount", "date", "method", "note", "timestamp", "status"],
  Courses:           ["course_id", "subject", "level", "name", "description", "active"],
  Chapters:          ["chapter_id", "course_id", "order", "title", "topics", "resource_url"],
  BatchProgress:     ["batch_id", "chapter_id", "status", "done_date"],
  PTM:               ["ptm_id", "student_id", "date", "mode", "met_with", "teacher_id", "summary", "status", "timestamp"],
  Tests:             ["test_id", "title", "batch_id", "pass_pct", "negative_marking", "marks_to_cut", "duration_min", "published", "created"],
  Questions:         ["question_id", "test_id", "text", "opt_a", "opt_b", "opt_c", "opt_d", "correct", "marks"],
  Attempts:          ["attempt_id", "test_id", "student_id", "score", "max_score", "submitted_at"],
  Answers:           ["attempt_id", "question_id", "chosen", "correct"],
  StaffAttendance:   ["log_id", "staff_id", "date", "status", "marked_by", "timestamp", "note"],
  StaffTasks:        ["task_id", "staff_id", "title", "detail", "due_date", "status", "created", "done_date", "created_by"],
  SalaryAdjustments: ["adj_id", "staff_id", "period", "kind", "amount", "note", "status", "created"],
  SalaryPayments:    ["pay_id", "staff_id", "period", "amount", "date", "method", "note", "timestamp", "status"],
};

const auth = new googleAuth.GoogleAuth({ credentials: JSON.parse(SA), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const api = sheetsApi({ version: "v4", auth });

const meta = await api.spreadsheets.get({ spreadsheetId: SHEET_ID });
const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties.title));

// 1) create missing tabs
const toCreate = Object.keys(TABS).filter((t) => !existing.has(t));
if (toCreate.length) {
  await api.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  console.log(`+ created ${toCreate.length} tab(s): ${toCreate.join(", ")}`);
} else {
  console.log("all tabs already present");
}

// 2) write header row where row 1 is empty (never overwrite data)
let wrote = 0;
for (const [tab, headers] of Object.entries(TABS)) {
  const r = await api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!1:1` });
  const hasHeader = r.data.values?.[0]?.length;
  if (hasHeader) { console.log(`= ${tab} (header exists)`); continue; }
  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });
  wrote++;
  console.log(`✎ ${tab} (${headers.length} cols)`);
}

// 3) remove the default "Sheet1" if it's still empty and not one of ours
const sheet1 = (meta.data.sheets ?? []).find((s) => s.properties.title === "Sheet1" && !(s.properties.title in TABS));
if (sheet1) {
  try {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }] },
    });
    console.log("- removed default Sheet1");
  } catch { /* ignore if it can't be deleted */ }
}

console.log(`\nDone. ${Object.keys(TABS).length} tabs ensured, ${wrote} header row(s) written.`);
console.log("Next: seed a first owner PIN (scripts/seed-pins.mjs), then npm run dev.");
