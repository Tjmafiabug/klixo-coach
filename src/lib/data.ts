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
 * Is this enrollment in effect on `date`? An ended enrollment (status "left" with
 * a past end_date) still covers every session up to its end_date — so reopening an
 * old class for correction keeps showing the student (N11). Only "inactive"
 * (voided) enrollments never count. "Currently enrolled" is the stricter
 * `status === "active" && end_date === ""`.
 */
function enrollmentOnDate(e: Enrollment, date: string): boolean {
  return (
    (e.status === "active" || e.status === "left") &&
    e.start_date <= date &&
    (e.end_date === "" || e.end_date >= date)
  );
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

  // distinct students per batch (a student with overlapping enrollment rows —
  // e.g. an ended row + a backdated re-enroll — must count once)
  const rosterByBatch = new Map<string, Set<string>>();
  for (const e of enrolls) {
    if (!enrollmentOnDate(e, date)) continue;
    if (!rosterByBatch.has(e.batch_id)) rosterByBatch.set(e.batch_id, new Set());
    rosterByBatch.get(e.batch_id)!.add(e.student_id);
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
      const rosterSet = rosterByBatch.get(s.batch_id) ?? new Set<string>();
      // count present only among current roster, so presentCount never exceeds rosterSize
      const present = [...latest.values()].filter(
        (a) => a.status === "present" && rosterSet.has(a.student_id),
      ).length;
      return {
        ...s,
        batchName: batchById.get(s.batch_id)?.name ?? s.batch_id,
        roomName: roomById.get(s.room_id)?.name ?? s.room_id,
        rosterSize: rosterSet.size,
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
  const ids = [
    ...new Set(
      enrolls
        .filter((e) => e.batch_id === batchId && enrollmentOnDate(e, sessionDate))
        .map((e) => e.student_id),
    ),
  ];

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
    if (
      !prev ||
      a.timestamp > prev.timestamp ||
      (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
    )
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
  const id = `SES${String(max + 1).padStart(4, "0")}`;
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
    // with a date: in effect that day (ended-but-in-window students count);
    // without (future-facing clash among rules): only open enrollments.
    if (onDate ? !enrollmentOnDate(e, onDate) : !(e.status === "active" && e.end_date === ""))
      continue;
    if (!m.has(e.batch_id)) m.set(e.batch_id, new Set());
    m.get(e.batch_id)!.add(e.student_id);
  }
  return m;
}

function todayFromCfg(cfg: Map<string, string>): string {
  return cfg.get("demo_today")?.trim() || centerToday();
}

export interface HealthTabs {
  sessions: Session[];
  enrolls: Enrollment[];
  batches: Batch[];
  rooms: Room[];
  teachers: Teacher[];
  cfg: Map<string, string>;
}

async function readHealthTabs(): Promise<HealthTabs> {
  const [sessions, enrolls, batches, rooms, teachers, cfg] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Enrollment>("Enrollments"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Teacher>("Teachers"),
    config(),
  ]);
  return { sessions, enrolls, batches, rooms, teachers, cfg };
}

/** Read-time schedule-health: all clashes among active sessions in the window.
 *  Pass `pre` to reuse already-loaded tabs (avoids re-reading on the dashboard). */
export async function scheduleHealth(pre?: HealthTabs): Promise<{ clashes: Clash[] }> {
  const { sessions, enrolls, batches, rooms, teachers, cfg } =
    pre ?? (await readHealthTabs());
  const today = todayFromCfg(cfg);
  const end = addDays(today, HORIZON_DAYS);
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
  const [rules, enrolls, cfg] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Enrollment>("Enrollments"),
    config(),
  ]);
  const buffer = parseInt(cfg.get("room_changeover_buffer_min") ?? "0", 10) || 0;
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
    // room clash respects the changeover buffer (matches scheduleHealth); teacher
    // and student use the plain half-open overlap
    const sameTime = overlaps(cand.start, cand.end, r.start, r.end);
    if (r.room_id === cand.room_id && overlaps(cand.start, cand.end, r.start, r.end, buffer))
      block.add("room");
    if (r.teacher_id === cand.teacher_id && sameTime) block.add("teacher");
    if (
      r.batch_id !== cand.batch_id &&
      sameTime &&
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
 *  (past + attendance-bearing are frozen — PLAN §3 #7). Substituted future sessions
 *  (teacher overridden from the rule's previous teacher) are preserved, not reset. */
export async function updateRule(slotId: string, r: RuleInput): Promise<void> {
  const rules = await readTab<TimetableRule>("Timetable");
  const idx = rules.findIndex((x) => x.slot_id === slotId);
  if (idx < 0) return;
  const prevTeacher = rules[idx].teacher_id;
  await updateValues(`Timetable!A${idx + 2}:I${idx + 2}`, [ruleRow(slotId, r)]);
  await regenSlotFuture(slotId, prevTeacher);
}

export async function expireRule(slotId: string, effectiveTo: string): Promise<void> {
  const rules = await readTab<TimetableRule>("Timetable");
  const idx = rules.findIndex((x) => x.slot_id === slotId);
  if (idx < 0) return;
  const prevTeacher = rules[idx].teacher_id;
  await updateValues(`Timetable!I${idx + 2}`, [[effectiveTo]]);
  await regenSlotFuture(slotId, prevTeacher);
}

/**
 * Delete a slot's future, non-frozen sessions, then regenerate from current rules.
 * `keepTeacher` = the rule's PREVIOUS teacher: only sessions still assigned to that
 * teacher are "following the rule" and safe to recreate. A future session whose
 * teacher_id differs (a substitute) is left untouched, so substitutes survive a
 * rule edit/expiry (no silent revert to the default teacher).
 */
async function regenSlotFuture(slotId: string, keepTeacher: string): Promise<void> {
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
      s.teacher_id === keepTeacher && // leave substitutes alone
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

export interface StatsTabs {
  attendance: AttendanceRow[];
  students: Student[];
  batches: Batch[];
  teachers: Teacher[];
  cfg: Map<string, string>;
}

async function readStatsTabs(): Promise<StatsTabs> {
  const [attendance, students, batches, teachers, cfg] = await Promise.all([
    readTab<AttendanceRow>("Attendance"),
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
    readTab<Teacher>("Teachers"),
    config(),
  ]);
  return { attendance, students, batches, teachers, cfg };
}

export async function getOwnerStats(pre?: StatsTabs): Promise<OwnerStats> {
  const { attendance, students, batches, teachers, cfg } =
    pre ?? (await readStatsTabs());
  const threshold = parseInt(cfg.get("attendance_threshold") ?? "75", 10);
  const teacherById = new Map(teachers.map((t) => [t.teacher_id, t]));

  // latest mark per (session, student)
  const latest = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    const k = `${a.session_id}|${a.student_id}`;
    const prev = latest.get(k);
    if (
      !prev ||
      a.timestamp > prev.timestamp ||
      (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
    )
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

/**
 * Owner dashboard data in a single pass: reads each tab once and computes both
 * attendance stats and schedule health (avoids re-reading Batches/Teachers/Config).
 */
export async function getOwnerDashboard(): Promise<{
  stats: OwnerStats;
  health: { clashes: Clash[] };
  integrity: IntegrityIssue[];
}> {
  const [attendance, students, batches, teachers, rooms, sessions, enrolls, rules, cfg] =
    await Promise.all([
      readTab<AttendanceRow>("Attendance"),
      readTab<Student>("Students"),
      readTab<Batch>("Batches"),
      readTab<Teacher>("Teachers"),
      readTab<Room>("Rooms"),
      readTab<Session>("Sessions"),
      readTab<Enrollment>("Enrollments"),
      readTab<TimetableRule>("Timetable"),
      config(),
    ]);
  const [stats, health] = await Promise.all([
    getOwnerStats({ attendance, students, batches, teachers, cfg }),
    scheduleHealth({ sessions, enrolls, batches, rooms, teachers, cfg }),
  ]);
  const integrity = integrityIssues({ sessions, enrolls, batches, rooms, teachers, students, rules });
  return { stats, health, integrity };
}

// ============================================================================
// Milestone C — owner data management (self-service CRUD)
// All writes are positional: every tab's column order equals its type's field
// order (verified against the Sheet). IDs keep the existing format: a letter
// prefix + zero-padded counter (T001 / S001 / B001 / E001 / R001).
// ============================================================================

/** Next id for a tab: max numeric suffix among `ids`, +1, `prefix` + `pad`-wide. */
function nextId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  for (const id of ids) {
    const n = parseInt(id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

// ---------------- C5 Rooms ----------------

export interface RoomView extends Room {
  /** active batches + timetable rules that reference this room (block delete). */
  inUse: number;
}

export async function listRooms(): Promise<RoomView[]> {
  const [rooms, batches, rules] = await Promise.all([
    readTab<Room>("Rooms"),
    readTab<Batch>("Batches"),
    readTab<TimetableRule>("Timetable"),
  ]);
  const refs = new Map<string, number>();
  for (const b of batches)
    if (b.active === "TRUE") refs.set(b.room_id, (refs.get(b.room_id) ?? 0) + 1);
  for (const r of rules) refs.set(r.room_id, (refs.get(r.room_id) ?? 0) + 1);
  return rooms
    .map((r) => ({ ...r, inUse: refs.get(r.room_id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRoom(id: string): Promise<Room | null> {
  const rooms = await readTab<Room>("Rooms");
  return rooms.find((r) => r.room_id === id) ?? null;
}

export async function createRoom(input: {
  name: string;
  capacity: string;
}): Promise<string> {
  const rooms = await readTab<Room>("Rooms");
  const id = nextId(rooms.map((r) => r.room_id), "R", 3);
  await appendRows("Rooms", [[id, input.name, input.capacity]]);
  return id;
}

export async function updateRoom(
  id: string,
  input: { name: string; capacity: string },
): Promise<void> {
  const rooms = await readTab<Room>("Rooms");
  const idx = rooms.findIndex((r) => r.room_id === id);
  if (idx < 0) return;
  await updateValues(`Rooms!A${idx + 2}:C${idx + 2}`, [
    [id, input.name, input.capacity],
  ]);
}

/** References that block deleting a room: active batches + timetable rules + ANY
 *  non-cancelled session (past or future, incl. adhoc/extra) pointing at it.
 *  Past sessions count too — deleting their room would orphan attendance history
 *  and, since ids are reused on delete, mis-attribute it to a future new room. */
export async function roomUsage(id: string): Promise<number> {
  const [batches, rules, sessions] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<TimetableRule>("Timetable"),
    readTab<Session>("Sessions"),
  ]);
  return (
    batches.filter((b) => b.active === "TRUE" && b.room_id === id).length +
    rules.filter((r) => r.room_id === id).length +
    sessions.filter((s) => s.room_id === id && s.status !== "cancelled").length
  );
}

export async function deleteRoom(id: string): Promise<void> {
  const rooms = await readTab<Room>("Rooms");
  const idx = rooms.findIndex((r) => r.room_id === id);
  if (idx >= 0) await deleteRows("Rooms", [idx + 2]);
}

// ---------------- C6 Holidays ----------------

export interface Holiday {
  date: string;
  name: string;
}

export async function listHolidays(): Promise<Holiday[]> {
  const rows = await readTab<Holiday>("Holidays");
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Add a holiday (idempotent on date), then suppress its now-orphaned future
 *  recurring sessions via the generator (attendance-bearing ones stay frozen). */
export async function createHoliday(input: {
  date: string;
  name: string;
}): Promise<void> {
  const rows = await readTab<Holiday>("Holidays");
  if (rows.some((h) => h.date === input.date)) return;
  await appendRows("Holidays", [[input.date, input.name]]);
  await generateSessions();
}

/** Remove a holiday, then regenerate so the freed dates get their sessions back. */
export async function deleteHoliday(date: string): Promise<void> {
  const rows = await readTab<Holiday>("Holidays");
  const idx = rows.findIndex((h) => h.date === date);
  if (idx < 0) return;
  await deleteRows("Holidays", [idx + 2]);
  await generateSessions();
}

// ---------------- C4 Teachers ----------------

export interface TeacherView {
  teacher_id: string;
  name: string;
  phone: string;
  role: "teacher" | "owner";
  subjects: string;
  active: boolean;
  hasPin: boolean;
  /** active batches this teacher is assigned to (block deactivation). */
  batchCount: number;
}

export async function listTeachers(): Promise<TeacherView[]> {
  const [teachers, batches] = await Promise.all([
    readTab<Teacher>("Teachers"),
    readTab<Batch>("Batches"),
  ]);
  const bCount = new Map<string, number>();
  for (const b of batches)
    if (b.active === "TRUE")
      bCount.set(b.teacher_id, (bCount.get(b.teacher_id) ?? 0) + 1);
  return teachers
    .map((t) => ({
      teacher_id: t.teacher_id,
      name: t.name,
      phone: t.phone,
      role: t.role === "owner" ? ("owner" as const) : ("teacher" as const),
      subjects: t.subjects,
      active: t.active === "TRUE",
      hasPin: !!t.pin_hash && !t.pin_hash.startsWith("<"),
      batchCount: bCount.get(t.teacher_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
}

export async function getTeacher(id: string): Promise<Teacher | null> {
  const teachers = await readTab<Teacher>("Teachers");
  return teachers.find((t) => t.teacher_id === id) ?? null;
}

/** Is `phone` already used by another teacher? (login keys on phone — keep unique.) */
export async function teacherPhoneTaken(
  phone: string,
  exceptId?: string,
): Promise<boolean> {
  const teachers = await readTab<Teacher>("Teachers");
  return teachers.some((t) => t.phone === phone && t.teacher_id !== exceptId);
}

export async function createTeacher(input: {
  name: string;
  phone: string;
  role: "teacher" | "owner";
  subjects: string;
  pinHash: string;
}): Promise<string> {
  const teachers = await readTab<Teacher>("Teachers");
  const id = nextId(teachers.map((t) => t.teacher_id), "T", 3);
  await appendRows("Teachers", [
    [id, input.name, input.phone, input.pinHash, input.role, input.subjects, "TRUE"],
  ]);
  return id;
}

/** Update editable fields; pin_hash + active are preserved from the saved row. */
export async function updateTeacher(
  id: string,
  input: { name: string; phone: string; role: "teacher" | "owner"; subjects: string },
): Promise<void> {
  const teachers = await readTab<Teacher>("Teachers");
  const idx = teachers.findIndex((t) => t.teacher_id === id);
  if (idx < 0) return;
  const cur = teachers[idx];
  await updateValues(`Teachers!A${idx + 2}:G${idx + 2}`, [
    [id, input.name, input.phone, cur.pin_hash, input.role, input.subjects, cur.active],
  ]);
}

export async function setTeacherPin(id: string, pinHash: string): Promise<void> {
  const teachers = await readTab<Teacher>("Teachers");
  const idx = teachers.findIndex((t) => t.teacher_id === id);
  if (idx >= 0) await updateValues(`Teachers!D${idx + 2}`, [[pinHash]]);
}

export async function setTeacherActive(id: string, active: boolean): Promise<void> {
  const teachers = await readTab<Teacher>("Teachers");
  const idx = teachers.findIndex((t) => t.teacher_id === id);
  if (idx >= 0)
    await updateValues(`Teachers!G${idx + 2}`, [[active ? "TRUE" : "FALSE"]]);
}

/** Number of active owners other than `exceptId` — guards the last-owner rule. */
export async function otherActiveOwners(exceptId: string): Promise<number> {
  const teachers = await readTab<Teacher>("Teachers");
  return teachers.filter(
    (t) => t.role === "owner" && t.active === "TRUE" && t.teacher_id !== exceptId,
  ).length;
}

// ---------------- C1 Students ----------------

export interface StudentView {
  student_id: string;
  name: string;
  phone: string;
  parent_phone: string;
  join_date: string;
  active: boolean;
  batchCount: number;
}

export async function listStudents(): Promise<StudentView[]> {
  const [students, enrolls] = await Promise.all([
    readTab<Student>("Students"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const bCount = new Map<string, number>();
  for (const e of enrolls)
    if (e.status === "active" && e.end_date === "")
      bCount.set(e.student_id, (bCount.get(e.student_id) ?? 0) + 1);
  return students
    .map((s) => ({
      student_id: s.student_id,
      name: s.name,
      phone: s.phone,
      parent_phone: s.parent_phone,
      join_date: s.join_date,
      active: s.status === "active",
      batchCount: bCount.get(s.student_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
}

export async function getStudent(id: string): Promise<Student | null> {
  const students = await readTab<Student>("Students");
  return students.find((s) => s.student_id === id) ?? null;
}

export async function createStudent(input: {
  name: string;
  phone: string;
  parent_phone: string;
  join_date: string;
  notes: string;
}): Promise<string> {
  const students = await readTab<Student>("Students");
  const id = nextId(students.map((s) => s.student_id), "S", 3);
  await appendRows("Students", [
    [id, input.name, input.phone, input.parent_phone, input.join_date, "active", input.notes],
  ]);
  return id;
}

export async function updateStudent(
  id: string,
  input: {
    name: string;
    phone: string;
    parent_phone: string;
    join_date: string;
    notes: string;
  },
): Promise<void> {
  const students = await readTab<Student>("Students");
  const idx = students.findIndex((s) => s.student_id === id);
  if (idx < 0) return;
  const cur = students[idx];
  await updateValues(`Students!A${idx + 2}:G${idx + 2}`, [
    [id, input.name, input.phone, input.parent_phone, input.join_date, cur.status, input.notes],
  ]);
}

export async function setStudentActive(id: string, active: boolean): Promise<void> {
  const students = await readTab<Student>("Students");
  const idx = students.findIndex((s) => s.student_id === id);
  if (idx >= 0)
    await updateValues(`Students!F${idx + 2}`, [[active ? "active" : "inactive"]]);
}

export interface StudentProfile {
  student: Student;
  enrollments: {
    enroll_id: string;
    batch_id: string;
    batchName: string;
    start_date: string;
    end_date: string;
    status: string;
  }[];
  history: { date: string; batchName: string; status: string; method: string }[];
  present: number;
  total: number;
  pct: number;
}

/** Profile: the student, their enrollments (batch-named) and attendance history
 *  (latest mark per session, newest first). % is over fully-marked sessions. */
export async function getStudentProfile(id: string): Promise<StudentProfile | null> {
  const [students, enrolls, batches, attendance] = await Promise.all([
    readTab<Student>("Students"),
    readTab<Enrollment>("Enrollments"),
    readTab<Batch>("Batches"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const student = students.find((s) => s.student_id === id);
  if (!student) return null;
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));

  const enrollments = enrolls
    .filter((e) => e.student_id === id)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .map((e) => ({
      enroll_id: e.enroll_id,
      batch_id: e.batch_id,
      batchName: bName.get(e.batch_id) ?? e.batch_id,
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
    }));

  // latest mark per session for this student
  const latest = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    if (a.student_id !== id) continue;
    const prev = latest.get(a.session_id);
    if (
      !prev ||
      a.timestamp > prev.timestamp ||
      (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
    )
      latest.set(a.session_id, a);
  }
  const marks = [...latest.values()];
  const present = marks.filter((m) => m.status === "present").length;
  const history = marks
    .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100)
    .map((m) => ({
      date: m.date,
      batchName: bName.get(m.batch_id) ?? m.batch_id,
      status: m.status,
      method: m.method,
    }));
  return {
    student,
    enrollments,
    history,
    present,
    total: marks.length,
    pct: marks.length ? present / marks.length : 0,
  };
}

// ---------------- C2 Batches ----------------

export interface BatchView {
  batch_id: string;
  name: string;
  subject: string;
  teacher_id: string;
  teacherName: string;
  room_id: string;
  roomName: string;
  fee: string;
  level: string;
  active: boolean;
  enrolled: number;
}

export async function listBatches(): Promise<BatchView[]> {
  const [batches, teachers, rooms, enrolls] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Teacher>("Teachers"),
    readTab<Room>("Rooms"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const tName = new Map(teachers.map((t) => [t.teacher_id, t.name]));
  const rName = new Map(rooms.map((r) => [r.room_id, r.name]));
  const enrolled = new Map<string, number>();
  for (const e of enrolls)
    if (e.status === "active" && e.end_date === "")
      enrolled.set(e.batch_id, (enrolled.get(e.batch_id) ?? 0) + 1);
  return batches
    .map((b) => ({
      batch_id: b.batch_id,
      name: b.name,
      subject: b.subject,
      teacher_id: b.teacher_id,
      teacherName: tName.get(b.teacher_id) ?? b.teacher_id,
      room_id: b.room_id,
      roomName: rName.get(b.room_id) ?? b.room_id,
      fee: b.fee,
      level: b.level,
      active: b.active === "TRUE",
      enrolled: enrolled.get(b.batch_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
}

export async function getBatch(id: string): Promise<Batch | null> {
  const batches = await readTab<Batch>("Batches");
  return batches.find((b) => b.batch_id === id) ?? null;
}

export async function createBatch(input: {
  name: string;
  subject: string;
  teacher_id: string;
  room_id: string;
  fee: string;
  level: string;
}): Promise<string> {
  const batches = await readTab<Batch>("Batches");
  const id = nextId(batches.map((b) => b.batch_id), "B", 3);
  await appendRows("Batches", [
    [id, input.name, input.subject, input.teacher_id, input.room_id, input.fee, input.level, "TRUE"],
  ]);
  return id;
}

export async function updateBatch(
  id: string,
  input: {
    name: string;
    subject: string;
    teacher_id: string;
    room_id: string;
    fee: string;
    level: string;
  },
): Promise<void> {
  const batches = await readTab<Batch>("Batches");
  const idx = batches.findIndex((b) => b.batch_id === id);
  if (idx < 0) return;
  const cur = batches[idx];
  await updateValues(`Batches!A${idx + 2}:H${idx + 2}`, [
    [id, input.name, input.subject, input.teacher_id, input.room_id, input.fee, input.level, cur.active],
  ]);
}

export async function setBatchActive(id: string, active: boolean): Promise<void> {
  const batches = await readTab<Batch>("Batches");
  const idx = batches.findIndex((b) => b.batch_id === id);
  if (idx >= 0)
    await updateValues(`Batches!H${idx + 2}`, [[active ? "TRUE" : "FALSE"]]);
}

export interface BatchDetail {
  batch: Batch;
  teacherName: string;
  roomName: string;
  enrollments: {
    enroll_id: string;
    student_id: string;
    studentName: string;
    start_date: string;
    end_date: string;
    status: string;
  }[];
  /** active students NOT currently enrolled here (candidates to add). */
  candidates: { id: string; name: string }[];
}

export async function getBatchDetail(id: string): Promise<BatchDetail | null> {
  const [batches, teachers, rooms, students, enrolls] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Teacher>("Teachers"),
    readTab<Room>("Rooms"),
    readTab<Student>("Students"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const batch = batches.find((b) => b.batch_id === id);
  if (!batch) return null;
  const sName = new Map(students.map((s) => [s.student_id, s.name]));
  const here = enrolls.filter((e) => e.batch_id === id);
  const activeHere = new Set(
    here.filter((e) => e.status === "active" && e.end_date === "").map((e) => e.student_id),
  );
  const enrollments = here
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        (sName.get(a.student_id) ?? "").localeCompare(sName.get(b.student_id) ?? ""),
    )
    .map((e) => ({
      enroll_id: e.enroll_id,
      student_id: e.student_id,
      studentName: sName.get(e.student_id) ?? e.student_id,
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
    }));
  const candidates = students
    .filter((s) => s.status === "active" && !activeHere.has(s.student_id))
    .map((s) => ({ id: s.student_id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    batch,
    teacherName: teachers.find((t) => t.teacher_id === batch.teacher_id)?.name ?? batch.teacher_id,
    roomName: rooms.find((r) => r.room_id === batch.room_id)?.name ?? batch.room_id,
    enrollments,
    candidates,
  };
}

/** Active batches a student could be added to (not already actively enrolled). */
export async function batchesForStudent(
  studentId: string,
): Promise<{ id: string; name: string }[]> {
  const [batches, enrolls] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const inBatch = new Set(
    enrolls
      .filter((e) => e.student_id === studentId && e.status === "active" && e.end_date === "")
      .map((e) => e.batch_id),
  );
  return batches
    .filter((b) => b.active === "TRUE" && !inBatch.has(b.batch_id))
    .map((b) => ({ id: b.batch_id, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------- C3 Enrollments ----------------

/** True if the student already has an open active enrollment in this batch. */
export async function enrollmentExists(
  studentId: string,
  batchId: string,
): Promise<boolean> {
  const enrolls = await readTab<Enrollment>("Enrollments");
  return enrolls.some(
    (e) =>
      e.student_id === studentId &&
      e.batch_id === batchId &&
      e.status === "active" &&
      e.end_date === "",
  );
}

/** Warn-level clash: does this batch's timetable overlap another batch the
 *  student is actively enrolled in (shared day + time)? (PLAN §8 student=warn) */
export async function enrollmentClash(
  studentId: string,
  batchId: string,
): Promise<boolean> {
  const [enrolls, rules] = await Promise.all([
    readTab<Enrollment>("Enrollments"),
    readTab<TimetableRule>("Timetable"),
  ]);
  const otherBatches = new Set(
    enrolls
      .filter(
        (e) =>
          e.student_id === studentId &&
          e.batch_id !== batchId &&
          e.status === "active" &&
          e.end_date === "",
      )
      .map((e) => e.batch_id),
  );
  if (otherBatches.size === 0) return false;
  const newRules = rules.filter((r) => r.batch_id === batchId);
  const otherRules = rules.filter((r) => otherBatches.has(r.batch_id));
  for (const n of newRules) {
    const nDays = n.day_of_week.split(",").map((x) => x.trim());
    for (const o of otherRules) {
      const sharedDay = o.day_of_week
        .split(",")
        .map((x) => x.trim())
        .some((d) => nDays.includes(d));
      if (
        sharedDay &&
        rangesIntersect(n.effective_from, n.effective_to, o.effective_from, o.effective_to) &&
        overlaps(n.start, n.end, o.start, o.end)
      )
        return true;
    }
  }
  return false;
}

export async function createEnrollment(input: {
  student_id: string;
  batch_id: string;
  start_date: string;
}): Promise<string> {
  const enrolls = await readTab<Enrollment>("Enrollments");
  const id = nextId(enrolls.map((e) => e.enroll_id), "E", 3);
  await appendRows("Enrollments", [
    [id, input.student_id, input.batch_id, input.start_date, "", "active"],
  ]);
  return id;
}

/**
 * End an enrollment: stamp end_date and mark status "left" (honest in the Sheet).
 * Roster inclusion is window-based (see {@link enrollmentOnDate}), so the student
 * still appears on sessions up to end_date — past correction keeps working — while
 * "currently enrolled" counters (`status active && end_date empty`) drop them.
 */
export async function endEnrollment(
  enrollId: string,
  endDate: string,
): Promise<void> {
  const enrolls = await readTab<Enrollment>("Enrollments");
  const idx = enrolls.findIndex((e) => e.enroll_id === enrollId);
  if (idx < 0) return;
  await updateValues(`Enrollments!E${idx + 2}:F${idx + 2}`, [[endDate, "left"]]);
}

export async function getEnrollment(enrollId: string): Promise<Enrollment | null> {
  const enrolls = await readTab<Enrollment>("Enrollments");
  return enrolls.find((e) => e.enroll_id === enrollId) ?? null;
}

// ---------------- N7 referential integrity ----------------

/**
 * Write-time guard: do the referenced rows exist (and, where applicable, are they
 * active)? Reads only the tabs implied by the supplied refs. Used by the write
 * actions so a crafted/stale request can't create dangling rows.
 */
export async function refsExist(refs: {
  batchId?: string;
  roomId?: string;
  teacherId?: string;
  studentId?: string;
  /** require the referenced teacher to be active (default true). Set false when
   *  editing a batch that may legitimately keep an already-deactivated teacher. */
  teacherMustBeActive?: boolean;
}): Promise<boolean> {
  // empty-string ids are treated as "no ref" (skipped), not "must validate"
  const [batches, rooms, teachers, students] = await Promise.all([
    refs.batchId ? readTab<Batch>("Batches") : Promise.resolve<Batch[]>([]),
    refs.roomId ? readTab<Room>("Rooms") : Promise.resolve<Room[]>([]),
    refs.teacherId ? readTab<Teacher>("Teachers") : Promise.resolve<Teacher[]>([]),
    refs.studentId ? readTab<Student>("Students") : Promise.resolve<Student[]>([]),
  ]);
  if (refs.batchId) {
    const b = batches.find((x) => x.batch_id === refs.batchId);
    if (!b || b.active !== "TRUE") return false;
  }
  if (refs.roomId && !rooms.some((x) => x.room_id === refs.roomId)) return false;
  if (refs.teacherId) {
    const t = teachers.find((x) => x.teacher_id === refs.teacherId);
    if (!t) return false;
    if (refs.teacherMustBeActive !== false && t.active !== "TRUE") return false;
  }
  if (refs.studentId) {
    const s = students.find((x) => x.student_id === refs.studentId);
    if (!s || s.status !== "active") return false;
  }
  return true;
}

export interface IntegrityIssue {
  kind: string;
  detail: string;
}

/**
 * Read-time integrity scan (N7): dangling references introduced by direct-Sheet
 * edits — sessions/rules/enrollments pointing at rows that no longer exist. Pure
 * over already-loaded tabs so the dashboard can run it without extra reads.
 */
export function integrityIssues(tabs: {
  sessions: Session[];
  enrolls: Enrollment[];
  batches: Batch[];
  rooms: Room[];
  teachers: Teacher[];
  students: Student[];
  rules?: TimetableRule[];
}): IntegrityIssue[] {
  const batchIds = new Set(tabs.batches.map((b) => b.batch_id));
  const roomIds = new Set(tabs.rooms.map((r) => r.room_id));
  const teacherIds = new Set(tabs.teachers.map((t) => t.teacher_id));
  const studentIds = new Set(tabs.students.map((s) => s.student_id));
  const issues: IntegrityIssue[] = [];

  for (const s of tabs.sessions) {
    if (s.status === "cancelled") continue;
    if (!batchIds.has(s.batch_id)) issues.push({ kind: "session", detail: `${s.session_id} → missing batch ${s.batch_id}` });
    if (s.room_id && !roomIds.has(s.room_id)) issues.push({ kind: "session", detail: `${s.session_id} → missing room ${s.room_id}` });
    if (s.teacher_id && !teacherIds.has(s.teacher_id)) issues.push({ kind: "session", detail: `${s.session_id} → missing teacher ${s.teacher_id}` });
  }
  for (const e of tabs.enrolls) {
    if (!studentIds.has(e.student_id)) issues.push({ kind: "enrollment", detail: `${e.enroll_id} → missing student ${e.student_id}` });
    if (!batchIds.has(e.batch_id)) issues.push({ kind: "enrollment", detail: `${e.enroll_id} → missing batch ${e.batch_id}` });
  }
  for (const r of tabs.rules ?? []) {
    if (!batchIds.has(r.batch_id)) issues.push({ kind: "rule", detail: `${r.slot_id} → missing batch ${r.batch_id}` });
    if (r.room_id && !roomIds.has(r.room_id)) issues.push({ kind: "rule", detail: `${r.slot_id} → missing room ${r.room_id}` });
    if (r.teacher_id && !teacherIds.has(r.teacher_id)) issues.push({ kind: "rule", detail: `${r.slot_id} → missing teacher ${r.teacher_id}` });
  }
  return issues;
}

// ---------------- Manage hub counts ----------------

export interface ManageCounts {
  studentsActive: number;
  studentsTotal: number;
  batchesActive: number;
  batchesTotal: number;
  teachersActive: number;
  rooms: number;
  holidays: number;
  rules: number;
}

/** Counts for the /manage hub cards — one read per tab (no joins/sorts), instead
 *  of calling the six enriched list* functions (which re-read shared tabs). */
export async function getManageCounts(): Promise<ManageCounts> {
  const [students, batches, teachers, rooms, holidays, rules] = await Promise.all([
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
    readTab<Teacher>("Teachers"),
    readTab<Room>("Rooms"),
    readTab<Holiday>("Holidays"),
    readTab<TimetableRule>("Timetable"),
  ]);
  return {
    studentsActive: students.filter((s) => s.status === "active").length,
    studentsTotal: students.length,
    batchesActive: batches.filter((b) => b.active === "TRUE").length,
    batchesTotal: batches.length,
    teachersActive: teachers.filter((t) => t.active === "TRUE").length,
    rooms: rooms.length,
    holidays: holidays.length,
    rules: rules.length,
  };
}

// ---------------- C7 Settings (Config) ----------------

export interface CenterConfig {
  center_name: string;
  timezone: string;
  attendance_threshold: string;
  week_start: string;
  logo_url: string;
  room_changeover_buffer_min: string;
}

const CONFIG_KEYS: (keyof CenterConfig)[] = [
  "center_name",
  "timezone",
  "attendance_threshold",
  "week_start",
  "logo_url",
  "room_changeover_buffer_min",
];

export async function getCenterConfig(): Promise<CenterConfig> {
  const m = await config();
  return {
    center_name: m.get("center_name") ?? "",
    timezone: m.get("timezone") ?? (process.env.CENTER_TZ ?? "Asia/Kolkata"),
    attendance_threshold: m.get("attendance_threshold") ?? "75",
    week_start: m.get("week_start") ?? "Mon",
    logo_url: m.get("logo_url") ?? "",
    room_changeover_buffer_min: m.get("room_changeover_buffer_min") ?? "0",
  };
}

/** Upsert the editable Config keys: existing rows are updated in place, missing
 *  keys are appended. Other keys (e.g. demo_today) are left untouched. */
export async function updateCenterConfig(
  values: Partial<Record<keyof CenterConfig, string>>,
): Promise<void> {
  const rows = await readTab<ConfigRow>("Config");
  const rowByKey = new Map(rows.map((r, i) => [r.key, i + 2]));
  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];
  for (const key of CONFIG_KEYS) {
    const v = values[key];
    if (v === undefined) continue;
    const row = rowByKey.get(key);
    if (row) updates.push({ range: `Config!B${row}`, values: [[v]] });
    else appends.push([key, v]);
  }
  await Promise.all([batchUpdateValues(updates), appendRows("Config", appends)]);
}
