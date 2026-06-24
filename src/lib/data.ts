import "server-only";
import {
  readTab,
  appendRows,
  updateValues,
  batchUpdateValues,
  deleteRows,
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
 * - ADD missing (slot_id, date) sessions (skip holidays / out-of-range / wrong day).
 * - REMOVE orphans: recurring sessions in the window whose (slot_id, date) the rules
 *   no longer want (holiday added, rule's days changed, rule expired) — unless frozen.
 * Idempotent. Frozen = has attendance, or status=cancelled, or date < today; frozen
 * sessions (and all adhoc sessions) are never added/removed, so substitutes,
 * cancellations and marked attendance are preserved.
 */
export async function generateSessions(): Promise<{
  added: number;
  removed: number;
  horizonEnd: string;
}> {
  const today = await effectiveToday();
  const end = addDays(today, HORIZON_DAYS);

  const [rules, sessions, holidaysTab, attendance] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Session>("Sessions"),
    readTab<{ date: string; name: string }>("Holidays"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const holidays = new Set(holidaysTab.map((h) => h.date));
  const hasAttendance = new Set(attendance.map((a) => a.session_id));

  // what the rules want in the window
  const desired = new Set<string>();
  for (const r of rules) {
    const days = r.day_of_week.split(",").map((x) => x.trim());
    for (let d = today; d <= end; d = addDays(d, 1)) {
      if (holidays.has(d)) continue;
      if (!days.includes(dowOf(d))) continue;
      if (!(r.effective_from <= d && (r.effective_to === "" || r.effective_to >= d)))
        continue;
      desired.add(`${r.slot_id}|${d}`);
    }
  }

  const existing = new Set<string>();
  let max = 0;
  const orphanRows: number[] = [];
  sessions.forEach((s, i) => {
    const n = parseInt(s.session_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n < 9000 && n > max) max = n; // keep clear of adhoc 9000+
    if (s.source !== "recurring" || !s.slot_id) return; // adhoc untouched
    const key = `${s.slot_id}|${s.date}`;
    existing.add(key);
    // orphan? in window, not desired, not frozen
    const frozen =
      s.date < today || s.status === "cancelled" || hasAttendance.has(s.session_id);
    if (s.date >= today && s.date <= end && !desired.has(key) && !frozen) {
      orphanRows.push(i + 2); // 1-based sheet row
    }
  });

  // rules expand into row data for missing keys
  const appends: string[][] = [];
  const rowFor = new Map<string, TimetableRule>();
  for (const r of rules) rowFor.set(r.slot_id, r);
  for (const key of desired) {
    if (existing.has(key)) continue;
    const [slot, d] = key.split("|");
    const r = rowFor.get(slot)!;
    const id = `SES${String(++max).padStart(4, "0")}`;
    appends.push([
      id, d, r.batch_id, r.start, r.end, r.room_id, r.teacher_id,
      "scheduled", "recurring", r.slot_id,
    ]);
  }

  await appendRows("Sessions", appends);
  await deleteRows("Sessions", orphanRows);
  return { added: appends.length, removed: orphanRows.length, horizonEnd: end };
}

// ---------------- Timetable engine: clash detection ----------------

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
// half-open [start,end) overlap; `buf` (minutes) extends both ends (room changeover)
const overlaps = (
  aS: string, aE: string, bS: string, bE: string, buf = 0,
) => toMin(aS) < toMin(bE) + buf && toMin(bS) < toMin(aE) + buf;

const shareAny = (a: Set<string>, b: Set<string>) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
};

export type ClashType = "room" | "teacher" | "student";
export interface Clash {
  date: string;
  type: ClashType;
  blocking: boolean; // room/teacher block; student is a warning (PLAN §8)
  a: string;
  b: string;
}

async function activeStudentsByBatch(
  enrolls: Enrollment[],
  onDate?: string,
): Promise<Map<string, Set<string>>> {
  const m = new Map<string, Set<string>>();
  for (const e of enrolls) {
    if (e.status !== "active") continue;
    if (onDate && (e.start_date > onDate || (e.end_date !== "" && e.end_date < onDate)))
      continue;
    if (!m.has(e.batch_id)) m.set(e.batch_id, new Set());
    m.get(e.batch_id)!.add(e.student_id);
  }
  return m;
}

/** Read-time schedule-health: all clashes among active sessions in the window. */
export async function scheduleHealth(): Promise<{ clashes: Clash[] }> {
  const today = await effectiveToday();
  const end = addDays(today, HORIZON_DAYS);
  const [sessions, enrolls, batches, rooms, teachers, cfg] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Enrollment>("Enrollments"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Teacher>("Teachers"),
    config(),
  ]);
  const buffer = parseInt(cfg.get("room_changeover_buffer_min") ?? "0", 10) || 0;
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const rName = new Map(rooms.map((r) => [r.room_id, r.name]));
  const tName = new Map(teachers.map((t) => [t.teacher_id, t.name]));
  const studentsByBatch = await activeStudentsByBatch(enrolls);

  const label = (s: Session) =>
    `${bName.get(s.batch_id) ?? s.batch_id} ${s.start}–${s.end} (${rName.get(s.room_id) ?? s.room_id} / ${tName.get(s.teacher_id) ?? s.teacher_id})`;

  const ws = sessions.filter(
    (s) =>
      s.date >= today &&
      s.date <= end &&
      (s.status === "scheduled" || s.status === "extra"),
  );
  const byDate = new Map<string, Session[]>();
  for (const s of ws) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  const clashes: Clash[] = [];
  for (const [date, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.room_id === b.room_id && overlaps(a.start, a.end, b.start, b.end, buffer))
          clashes.push({ date, type: "room", blocking: true, a: label(a), b: label(b) });
        if (a.teacher_id === b.teacher_id && overlaps(a.start, a.end, b.start, b.end))
          clashes.push({ date, type: "teacher", blocking: true, a: label(a), b: label(b) });
        if (
          a.batch_id !== b.batch_id &&
          overlaps(a.start, a.end, b.start, b.end) &&
          shareAny(
            studentsByBatch.get(a.batch_id) ?? new Set(),
            studentsByBatch.get(b.batch_id) ?? new Set(),
          )
        )
          clashes.push({ date, type: "student", blocking: false, a: label(a), b: label(b) });
      }
    }
  }
  return { clashes };
}

/** Write-time clash check for a candidate session (e.g. an adhoc/extra class). */
export async function clashesForCandidate(cand: {
  date: string;
  start: string;
  end: string;
  roomId: string;
  teacherId: string;
  batchId: string;
  ignoreSessionId?: string;
}): Promise<{ blocking: ClashType[]; warnings: ClashType[] }> {
  const [sessions, enrolls, cfg] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Enrollment>("Enrollments"),
    config(),
  ]);
  const buffer = parseInt(cfg.get("room_changeover_buffer_min") ?? "0", 10) || 0;
  const studentsByBatch = await activeStudentsByBatch(enrolls, cand.date);
  const candStudents = studentsByBatch.get(cand.batchId) ?? new Set();

  const blocking = new Set<ClashType>();
  const warnings = new Set<ClashType>();
  for (const s of sessions) {
    if (s.date !== cand.date) continue;
    if (s.session_id === cand.ignoreSessionId) continue;
    if (s.status === "cancelled") continue;
    if (s.room_id === cand.roomId && overlaps(cand.start, cand.end, s.start, s.end, buffer))
      blocking.add("room");
    if (s.teacher_id === cand.teacherId && overlaps(cand.start, cand.end, s.start, s.end))
      blocking.add("teacher");
    if (
      s.batch_id !== cand.batchId &&
      overlaps(cand.start, cand.end, s.start, s.end) &&
      shareAny(candStudents, studentsByBatch.get(s.batch_id) ?? new Set())
    )
      warnings.add("student");
  }
  return { blocking: [...blocking], warnings: [...warnings] };
}

// ---------------- Timetable engine: rule CRUD + edit-in-place ----------------

const OPEN = "9999-12-31";
const rangesIntersect = (aF: string, aT: string, bF: string, bT: string) =>
  aF <= (bT || OPEN) && bF <= (aT || OPEN);

export interface RuleInput {
  slot_id?: string;
  batch_id: string;
  day_of_week: string; // comma-joined Mon..Sun
  start: string;
  end: string;
  room_id: string;
  teacher_id: string;
  effective_from: string;
  effective_to: string;
}

/** Rule-level clash check (date-range + day aware). room/teacher block, student warns. */
export async function ruleClashes(
  cand: RuleInput,
): Promise<{ blocking: ClashType[]; warnings: ClashType[] }> {
  const [rules, enrolls] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const studentsByBatch = await activeStudentsByBatch(enrolls);
  const candDays = new Set(cand.day_of_week.split(",").map((x) => x.trim()));
  const candStu = studentsByBatch.get(cand.batch_id) ?? new Set();
  const block = new Set<ClashType>();
  const warn = new Set<ClashType>();
  for (const r of rules) {
    if (cand.slot_id && r.slot_id === cand.slot_id) continue;
    const sharedDay = r.day_of_week
      .split(",")
      .map((x) => x.trim())
      .some((d) => candDays.has(d));
    if (!sharedDay) continue;
    if (!rangesIntersect(cand.effective_from, cand.effective_to, r.effective_from, r.effective_to))
      continue;
    if (!overlaps(cand.start, cand.end, r.start, r.end)) continue;
    if (r.room_id === cand.room_id) block.add("room");
    if (r.teacher_id === cand.teacher_id) block.add("teacher");
    if (
      r.batch_id !== cand.batch_id &&
      shareAny(candStu, studentsByBatch.get(r.batch_id) ?? new Set())
    )
      warn.add("student");
  }
  return { blocking: [...block], warnings: [...warn] };
}

function ruleRow(slotId: string, r: RuleInput): string[] {
  return [
    slotId, r.batch_id, r.day_of_week, r.start, r.end,
    r.room_id, r.teacher_id, r.effective_from, r.effective_to,
  ];
}

export async function createRule(r: RuleInput): Promise<string> {
  const rules = await readTab<TimetableRule>("Timetable");
  let max = 0;
  for (const x of rules) {
    const n = parseInt(x.slot_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  const slotId = `TT${String(max + 1).padStart(3, "0")}`;
  await appendRows("Timetable", [ruleRow(slotId, r)]);
  await generateSessions(); // create its future sessions
  return slotId;
}

/** Edit a rule in place, then regenerate ONLY its future, attendance-free sessions
 *  (past + attendance-bearing are frozen — PLAN §3 #7). */
export async function updateRule(slotId: string, r: RuleInput): Promise<void> {
  const rules = await readTab<TimetableRule>("Timetable");
  const idx = rules.findIndex((x) => x.slot_id === slotId);
  if (idx < 0) return;
  await updateValues(`Timetable!A${idx + 2}:I${idx + 2}`, [ruleRow(slotId, r)]);
  await regenSlotFuture(slotId);
}

export async function expireRule(slotId: string, effectiveTo: string): Promise<void> {
  const rules = await readTab<TimetableRule>("Timetable");
  const idx = rules.findIndex((x) => x.slot_id === slotId);
  if (idx < 0) return;
  await updateValues(`Timetable!I${idx + 2}`, [[effectiveTo]]);
  await regenSlotFuture(slotId);
}

/** Delete a slot's future, non-frozen sessions, then regenerate from current rules. */
async function regenSlotFuture(slotId: string): Promise<void> {
  const today = await effectiveToday();
  const [sessions, attendance] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const att = new Set(attendance.map((a) => a.session_id));
  const rows: number[] = [];
  sessions.forEach((s, i) => {
    if (
      s.slot_id === slotId &&
      s.date >= today &&
      s.status !== "cancelled" &&
      !att.has(s.session_id)
    )
      rows.push(i + 2);
  });
  await deleteRows("Sessions", rows);
  await generateSessions();
}

export interface TimetableRuleView {
  slot_id: string;
  batch_id: string;
  batchName: string;
  days: string[];
  start: string;
  end: string;
  room_id: string;
  roomName: string;
  teacher_id: string;
  teacherName: string;
  effective_from: string;
  effective_to: string;
}

export async function getTimetableView(): Promise<{
  rules: TimetableRuleView[];
  clashes: Clash[];
}> {
  const [rules, batches, rooms, teachers, health] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Teacher>("Teachers"),
    scheduleHealth(),
  ]);
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const rName = new Map(rooms.map((r) => [r.room_id, r.name]));
  const tName = new Map(teachers.map((t) => [t.teacher_id, t.name]));
  const view = rules
    .map((r) => ({
      slot_id: r.slot_id,
      batch_id: r.batch_id,
      batchName: bName.get(r.batch_id) ?? r.batch_id,
      days: r.day_of_week.split(",").map((x) => x.trim()),
      start: r.start,
      end: r.end,
      room_id: r.room_id,
      roomName: rName.get(r.room_id) ?? r.room_id,
      teacher_id: r.teacher_id,
      teacherName: tName.get(r.teacher_id) ?? r.teacher_id,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.batchName.localeCompare(b.batchName));
  return { rules: view, clashes: health.clashes };
}

export async function getRule(slotId: string): Promise<TimetableRule | null> {
  const rules = await readTab<TimetableRule>("Timetable");
  return rules.find((r) => r.slot_id === slotId) ?? null;
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
