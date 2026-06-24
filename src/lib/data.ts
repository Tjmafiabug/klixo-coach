import "server-only";
import {
  readTab,
  appendRows,
  updateValues,
  batchUpdateValues,
} from "@/lib/sheets";
import { centerToday, centerTimestamp } from "@/lib/time";
import type {
  Teacher,
  Student,
  Batch,
  Enrollment,
  Room,
  Session,
  AttendanceRow,
  AttendanceStatus,
  TimetableRule,
} from "@/lib/types";

type ConfigRow = { key: string; value: string };

async function config(): Promise<Map<string, string>> {
  const rows = await readTab<ConfigRow>("Config");
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** Centre-local today, with an optional Config `demo_today` override (demo determinism). */
export async function effectiveToday(): Promise<string> {
  const demo = (await config()).get("demo_today")?.trim();
  return demo || centerToday();
}

export async function getTeacherByPhone(phone: string): Promise<Teacher | null> {
  const teachers = await readTab<Teacher>("Teachers");
  const p = phone.trim();
  return teachers.find((t) => t.phone === p && t.active === "TRUE") ?? null;
}

export interface SessionMeta extends Session {
  batchName: string;
  roomName: string;
}

export interface TodaySession extends SessionMeta {
  rosterSize: number;
  marked: boolean;
  presentCount: number;
}

/**
 * Sessions on a given date, enriched with roster + marked state.
 * Owner sees all sessions that day; a teacher sees only their own (incl. ones
 * they substitute). Cancelled sessions are excluded from the markable list.
 */
export async function getSessionsOnDate(
  date: string,
  teacherId: string,
  isOwner: boolean,
): Promise<TodaySession[]> {
  const [sessions, batches, rooms, enrolls, attendance] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Enrollment>("Enrollments"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));
  const roomById = new Map(rooms.map((r) => [r.room_id, r]));

  const rosterByBatch = new Map<string, number>();
  for (const e of enrolls) {
    if (e.status !== "active") continue;
    if (e.start_date > date) continue;
    if (e.end_date !== "" && e.end_date < date) continue;
    rosterByBatch.set(e.batch_id, (rosterByBatch.get(e.batch_id) ?? 0) + 1);
  }

  return sessions
    .filter(
      (s) =>
        s.date === date &&
        (isOwner || s.teacher_id === teacherId) &&
        (s.status === "scheduled" || s.status === "extra"),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s) => {
      const latest = latestPerStudent(attendance, s.session_id);
      const present = [...latest.values()].filter((a) => a.status === "present").length;
      return {
        ...s,
        batchName: batchById.get(s.batch_id)?.name ?? s.batch_id,
        roomName: roomById.get(s.room_id)?.name ?? s.room_id,
        rosterSize: rosterByBatch.get(s.batch_id) ?? 0,
        marked: latest.size > 0,
        presentCount: present,
      };
    });
}

export async function getSessionMeta(
  sessionId: string,
): Promise<SessionMeta | null> {
  const [sessions, batches, rooms] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
  ]);
  const s = sessions.find((x) => x.session_id === sessionId);
  if (!s) return null;
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));
  const roomById = new Map(rooms.map((r) => [r.room_id, r]));
  return {
    ...s,
    batchName: batchById.get(s.batch_id)?.name ?? s.batch_id,
    roomName: roomById.get(s.room_id)?.name ?? s.room_id,
  };
}

export interface RosterEntry {
  student_id: string;
  name: string;
  /** Saved status for this session, or null if this student was never marked here. */
  saved: AttendanceStatus | null;
}

/**
 * Roster for a session: students enrolled (active) in the batch whose enrollment
 * had started by `sessionDate` (late joiners excluded from earlier sessions —
 * N11/A4). Each entry carries its saved mark (null = never marked).
 */
export async function getRoster(
  batchId: string,
  sessionId: string,
  sessionDate: string,
): Promise<{ roster: RosterEntry[]; alreadyMarked: boolean }> {
  const [enrolls, students, attendance] = await Promise.all([
    readTab<Enrollment>("Enrollments"),
    readTab<Student>("Students"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const studentById = new Map(students.map((s) => [s.student_id, s]));
  const ids = enrolls
    .filter(
      (e) =>
        e.batch_id === batchId &&
        e.status === "active" &&
        e.start_date <= sessionDate &&
        (e.end_date === "" || e.end_date >= sessionDate),
    )
    .map((e) => e.student_id);

  const latest = latestPerStudent(attendance, sessionId);
  const roster: RosterEntry[] = ids
    .map((id) => studentById.get(id))
    .filter((s): s is Student => !!s && s.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      student_id: s.student_id,
      name: s.name,
      saved: (latest.get(s.student_id)?.status ?? null) as AttendanceStatus | null,
    }));
  return { roster, alreadyMarked: roster.some((r) => r.saved !== null) };
}

function latestPerStudent(
  attendance: AttendanceRow[],
  sessionId: string,
): Map<string, AttendanceRow> {
  const m = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    if (a.session_id !== sessionId) continue;
    const prev = m.get(a.student_id);
    if (!prev || a.timestamp > prev.timestamp || a.log_id > prev.log_id)
      m.set(a.student_id, a);
  }
  return m;
}

/**
 * Save attendance. Each mark carries its own method/reason (the action layer
 * decides app vs manual per student). In-place: existing (session, student)
 * rows are updated; only new students are appended — never duplicates.
 * Pass only the students that should be written (unchanged ones are omitted
 * and left untouched).
 */
export async function submitAttendance(params: {
  sessionId: string;
  batchId: string;
  date: string;
  markedBy: string;
  marks: {
    studentId: string;
    status: AttendanceStatus;
    method: "app" | "manual";
    reason: string;
  }[];
}): Promise<number> {
  if (params.marks.length === 0) return 0;
  const attendance = await readTab<AttendanceRow>("Attendance");

  // sheet row number (1-based, +2 for header) of the latest row per student in this session
  const rowByStudent = new Map<string, number>();
  const logByStudent = new Map<string, string>();
  let max = 0;
  attendance.forEach((a, i) => {
    const n = parseInt(a.log_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
    if (a.session_id === params.sessionId) {
      rowByStudent.set(a.student_id, i + 2);
      logByStudent.set(a.student_id, a.log_id);
    }
  });

  const ts = centerTimestamp();
  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];
  let next = max;

  for (const m of params.marks) {
    const existingRow = rowByStudent.get(m.studentId);
    const logId = existingRow
      ? logByStudent.get(m.studentId)!
      : `A${String(++next).padStart(4, "0")}`;
    const row = [
      logId,
      params.sessionId,
      params.date,
      params.batchId,
      m.studentId,
      m.status,
      params.markedBy,
      m.method,
      ts,
      m.method === "manual" ? m.reason.trim() : "",
    ];
    if (existingRow) {
      updates.push({ range: `Attendance!A${existingRow}:J${existingRow}`, values: [row] });
    } else {
      appends.push(row);
    }
  }

  await Promise.all([
    batchUpdateValues(updates),
    appendRows("Attendance", appends),
  ]);
  return params.marks.length;
}

// ---------------- Session operations (cancel / substitute / extra class) ----------------

// Sessions columns: A session_id, B date, C batch_id, D start, E end,
// F room_id, G teacher_id, H status, I source
async function findSessionRow(sessionId: string): Promise<number | null> {
  const sessions = await readTab<Session>("Sessions");
  const i = sessions.findIndex((s) => s.session_id === sessionId);
  return i === -1 ? null : i + 2;
}

export async function cancelSession(sessionId: string): Promise<void> {
  const row = await findSessionRow(sessionId);
  if (row) await updateValues(`Sessions!H${row}`, [["cancelled"]]);
}

export async function setSubstitute(
  sessionId: string,
  teacherId: string,
): Promise<void> {
  const row = await findSessionRow(sessionId);
  if (row) await updateValues(`Sessions!G${row}`, [[teacherId]]);
}

export async function createExtraClass(params: {
  date: string;
  batchId: string;
  start: string;
  end: string;
  roomId: string;
  teacherId: string;
}): Promise<string> {
  const sessions = await readTab<Session>("Sessions");
  let max = 9000; // ad-hoc ids live above the generated range
  for (const s of sessions) {
    const n = parseInt(s.session_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  const id = `SES${max + 1}`;
  await appendRows("Sessions", [
    [
      id,
      params.date,
      params.batchId,
      params.start,
      params.end,
      params.roomId,
      params.teacherId,
      "extra",
      "adhoc",
      "", // slot_id (adhoc has no rule)
    ],
  ]);
  return id;
}

export interface FormOptions {
  batches: { id: string; name: string; teacherId: string; roomId: string }[];
  rooms: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
}

export async function getFormOptions(): Promise<FormOptions> {
  const [batches, rooms, teachers] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Teacher>("Teachers"),
  ]);
  return {
    batches: batches
      .filter((b) => b.active === "TRUE")
      .map((b) => ({
        id: b.batch_id,
        name: b.name,
        teacherId: b.teacher_id,
        roomId: b.room_id,
      })),
    rooms: rooms.map((r) => ({ id: r.room_id, name: r.name })),
    teachers: teachers
      .filter((t) => t.active === "TRUE")
      .map((t) => ({ id: t.teacher_id, name: t.name })),
  };
}

// ---------------- Timetable engine: generation ----------------

const HORIZON_DAYS = 30;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // Date.getUTCDay()

/** Weekday (Mon..Sun) of a YYYY-MM-DD date. Calendar weekday is tz-independent. */
function dowOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export async function getRules(): Promise<TimetableRule[]> {
  return readTab<TimetableRule>("Timetable");
}

/**
 * Generate recurring Sessions from Timetable rules over [today, today+horizon].
 * ADD-only + idempotent: creates the (slot_id, date) sessions that don't exist
 * yet, skipping holidays / out-of-effective-range / wrong-weekday. Never
 * duplicates and never touches existing sessions (so substitutes, cancellations
 * and marked attendance are preserved). Orphan removal is B2; rule-edit regen is B4.
 */
export async function generateSessions(): Promise<{ added: number; horizonEnd: string }> {
  const today = await effectiveToday();
  const end = addDays(today, HORIZON_DAYS);

  const [rules, sessions, holidaysTab] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Session>("Sessions"),
    readTab<{ date: string; name: string }>("Holidays"),
  ]);
  const holidays = new Set(holidaysTab.map((h) => h.date));

  const existing = new Set<string>();
  let max = 0;
  for (const s of sessions) {
    if (s.source === "recurring" && s.slot_id) existing.add(`${s.slot_id}|${s.date}`);
    const n = parseInt(s.session_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n < 9000 && n > max) max = n; // keep clear of adhoc 9000+ range
  }

  const appends: string[][] = [];
  for (const r of rules) {
    const days = r.day_of_week.split(",").map((x) => x.trim());
    for (let d = today; d <= end; d = addDays(d, 1)) {
      if (holidays.has(d)) continue;
      if (!days.includes(dowOf(d))) continue;
      if (!(r.effective_from <= d && (r.effective_to === "" || r.effective_to >= d)))
        continue;
      const key = `${r.slot_id}|${d}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const id = `SES${String(++max).padStart(4, "0")}`;
      appends.push([
        id, d, r.batch_id, r.start, r.end, r.room_id, r.teacher_id,
        "scheduled", "recurring", r.slot_id,
      ]);
    }
  }

  await appendRows("Sessions", appends);
  return { added: appends.length, horizonEnd: end };
}

// ---------------- Owner dashboard stats ----------------

interface Agg {
  present: number;
  total: number;
}

function aggregate(
  marks: AttendanceRow[],
  keyFn: (m: AttendanceRow) => string,
): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const mark of marks) {
    const k = keyFn(mark);
    const a = m.get(k) ?? { present: 0, total: 0 };
    a.total += 1;
    if (mark.status === "present") a.present += 1;
    m.set(k, a);
  }
  return m;
}

const pct = (a: Agg) => (a.total ? a.present / a.total : 0);

export interface OwnerStats {
  overall: number;
  totalMarks: number;
  threshold: number;
  studentCount: number;
  defaulters: { id: string; name: string; pct: number; total: number }[];
  batchStats: { id: string; name: string; pct: number; total: number }[];
  manualCount: number;
  recentManual: {
    studentName: string;
    batchName: string;
    date: string;
    status: string;
    markedByName: string;
    reason: string;
    timestamp: string;
  }[];
}

export async function getOwnerStats(): Promise<OwnerStats> {
  const [attendance, students, batches, teachers, cfg] = await Promise.all([
    readTab<AttendanceRow>("Attendance"),
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
    readTab<Teacher>("Teachers"),
    config(),
  ]);
  const threshold = parseInt(cfg.get("attendance_threshold") ?? "75", 10);
  const teacherById = new Map(teachers.map((t) => [t.teacher_id, t]));

  // latest mark per (session, student)
  const latest = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    const k = `${a.session_id}|${a.student_id}`;
    const prev = latest.get(k);
    if (!prev || a.timestamp > prev.timestamp || a.log_id > prev.log_id)
      latest.set(k, a);
  }
  const marks = [...latest.values()];
  const studentById = new Map(students.map((s) => [s.student_id, s]));
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));

  const present = marks.filter((m) => m.status === "present").length;
  const overall = marks.length ? present / marks.length : 0;

  const perStudent = aggregate(marks, (m) => m.student_id);
  const defaulters = [...perStudent.entries()]
    .map(([id, a]) => ({
      id,
      name: studentById.get(id)?.name ?? id,
      pct: pct(a),
      total: a.total,
    }))
    .filter((d) => d.pct * 100 < threshold)
    .sort((a, b) => a.pct - b.pct);

  const perBatch = aggregate(marks, (m) => m.batch_id);
  const batchStats = [...perBatch.entries()]
    .map(([id, a]) => ({
      id,
      name: batchById.get(id)?.name ?? id,
      pct: pct(a),
      total: a.total,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const manual = marks.filter((m) => m.method === "manual");
  const recentManual = manual
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 200) // defensive cap; owner sees all at demo scale
    .map((m) => ({
      studentName: studentById.get(m.student_id)?.name ?? m.student_id,
      batchName: batchById.get(m.batch_id)?.name ?? m.batch_id,
      date: m.date,
      status: m.status,
      markedByName: teacherById.get(m.marked_by)?.name ?? m.marked_by,
      reason: m.reason ?? "",
      timestamp: m.timestamp,
    }));

  return {
    overall,
    totalMarks: marks.length,
    threshold,
    studentCount: perStudent.size,
    defaulters,
    batchStats,
    manualCount: manual.length,
    recentManual,
  };
}
