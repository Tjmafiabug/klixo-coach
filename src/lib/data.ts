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
  Student,
  Batch,
  Enrollment,
  Room,
  Session,
  AttendanceRow,
  AttendanceStatus,
  TimetableRule,
  Staff,
  Course,
  Chapter,
  BatchProgressRow,
  FeeChargeRow,
  PaymentRow,
  ChargeKind,
  FeeMethod,
  PtmRow,
  PtmMode,
  PtmStatus,
  StaffAttendanceRow,
  StaffAttendanceStatus,
  StaffTaskRow,
  StaffTaskStatus,
  SalaryAdjustmentRow,
  SalaryAdjustmentKind,
  SalaryPaymentRow,
  TestRow,
  QuestionRow,
  AttemptRow,
  AnswerRow,
  OptionKey,
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

/** "teaching" unless explicitly flagged non-teaching (legacy rows have ""). */
export function staffTypeOf(s: { staff_type?: string }): "teaching" | "non_teaching" {
  return s.staff_type === "non_teaching" ? "non_teaching" : "teaching";
}

/** Can this person sign in? Login access is keyed on `role`, not staff_type —
 *  non-teaching staff carry role "" and never authenticate. */
export function canLogin(s: { role?: string }): boolean {
  return s.role === "teacher" || s.role === "owner";
}

export async function getTeacherByPhone(phone: string): Promise<Staff | null> {
  const teachers = await readTab<Staff>("Staff");
  const p = phone.trim();
  // login candidates only: active, phone match, and has a login role
  return teachers.find((t) => t.phone === p && t.active === "TRUE" && canLogin(t)) ?? null;
}

export interface SessionMeta extends Session {
  batchName: string;
  roomName: string;
}

export interface TodaySession extends SessionMeta {
  rosterSize: number;
  marked: boolean;
  attendedCount: number;
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

// ponytail: attendance policy in one place — "late" counts as attended for every
// rate. statusBreakdown (the donut) is the only surface that keeps the 3-way split.
function isAttended(status: AttendanceStatus): boolean {
  return status === "present" || status === "late";
}

/** A past session that should have attendance but has none — the /today nudge. */
export interface BacklogSession {
  session_id: string;
  date: string;
  batchName: string;
  roomName: string;
  start: string;
  rosterSize: number;
}

export interface DayBoard {
  /** Markable sessions for the selected `date` (the day's roster list). */
  sessions: TodaySession[];
  /** Past, markable, non-empty-roster sessions with ZERO marks, newest first,
   *  over the last BACKLOG_DAYS — relative to `today`, not the selected date. */
  backlog: BacklogSession[];
}

// How far back the "unmarked" nudge looks. Industry attendance systems finalize
// within ~1–2 weeks; older than this, backfilled marks are guesses. The register
// grid is the unbounded escape hatch for anything past the window.
const BACKLOG_DAYS = 14;

/**
 * The /today board in one read pass: the selected day's sessions AND the unmarked
 * backlog. Owner sees all; a teacher sees only their own (incl. substituted).
 * Reads the same five tabs once — the backlog costs no extra Sheets calls.
 */
export async function getDayBoard(
  date: string,
  today: string,
  teacherId: string,
  isOwner: boolean,
): Promise<DayBoard> {
  const [sessions, batches, rooms, enrolls, attendance] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Enrollment>("Enrollments"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));
  const roomById = new Map(rooms.map((r) => [r.room_id, r]));
  const mine = (s: Session) => isOwner || s.teacher_id === teacherId;
  const markable = (s: Session) => s.status === "scheduled" || s.status === "extra";
  const batchName = (id: string) => batchById.get(id)?.name ?? id;
  const roomName = (id: string) => roomById.get(id)?.name ?? id;

  // distinct students enrolled in `batchId` on `d` (overlapping enrollment rows
  // — e.g. an ended row + a backdated re-enroll — count once)
  const rosterOn = (batchId: string, d: string): number => {
    const set = new Set<string>();
    for (const e of enrolls) {
      if (e.batch_id === batchId && enrollmentOnDate(e, d)) set.add(e.student_id);
    }
    return set.size;
  };

  // ---- selected day's sessions ----
  const rosterByBatch = new Map<string, Set<string>>();
  for (const e of enrolls) {
    if (!enrollmentOnDate(e, date)) continue;
    if (!rosterByBatch.has(e.batch_id)) rosterByBatch.set(e.batch_id, new Set());
    rosterByBatch.get(e.batch_id)!.add(e.student_id);
  }
  const daySessions: TodaySession[] = sessions
    .filter((s) => s.date === date && mine(s) && markable(s))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s) => {
      const latest = latestPerStudent(attendance, s.session_id);
      const rosterSet = rosterByBatch.get(s.batch_id) ?? new Set<string>();
      // count attended (present + late) only among current roster, so it never exceeds rosterSize
      const attended = [...latest.values()].filter(
        (a) => isAttended(a.status) && rosterSet.has(a.student_id),
      ).length;
      return {
        ...s,
        batchName: batchName(s.batch_id),
        roomName: roomName(s.room_id),
        rosterSize: rosterSet.size,
        marked: latest.size > 0,
        attendedCount: attended,
      };
    });

  // ---- unmarked backlog (zero marks; partial sessions surface in the register) ----
  const hasMarks = new Set(attendance.map((a) => a.session_id));
  const from = addDays(today, -BACKLOG_DAYS);
  const backlog: BacklogSession[] = sessions
    .filter(
      (s) =>
        s.date < today &&
        s.date >= from &&
        mine(s) &&
        markable(s) &&
        !hasMarks.has(s.session_id),
    )
    // rosterOn re-scans enrolls per candidate — fine at backlog scale (≤ ~2 weeks
    // of a teacher's sessions); index by batch if that ever grows.
    .map((s) => ({ s, rosterSize: rosterOn(s.batch_id, s.date) }))
    .filter((x) => x.rosterSize > 0)
    .sort((a, b) => b.s.date.localeCompare(a.s.date) || a.s.start.localeCompare(b.s.start))
    .map(({ s, rosterSize }) => ({
      session_id: s.session_id,
      date: s.date,
      batchName: batchName(s.batch_id),
      roomName: roomName(s.room_id),
      start: s.start,
      rosterSize,
    }));

  return { sessions: daySessions, backlog };
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
 * Latest mark per (session, student) across the given rows — the canonical
 * "winning" attendance record (timestamp, then log_id tiebreak). Single source
 * for dashboard stats, the student profile, and the CSV exports.
 */
function latestPerSessionStudent(
  rows: AttendanceRow[],
): Map<string, AttendanceRow> {
  const m = new Map<string, AttendanceRow>();
  for (const a of rows) {
    const k = `${a.session_id}|${a.student_id}`;
    const prev = m.get(k);
    if (
      !prev ||
      a.timestamp > prev.timestamp ||
      (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
    )
      m.set(k, a);
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
    readTab<Staff>("Staff"),
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
    // only teaching staff may be assigned to a batch/session/rule
    teachers: teachers
      .filter((t) => t.active === "TRUE" && staffTypeOf(t) === "teaching")
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

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday (YYYY-MM-DD) of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -WEEKDAYS.indexOf(dowOf(iso)));
}

export interface WeekDay {
  weekday: string; // Mon..Sun
  iso: string; // YYYY-MM-DD
  dayNum: number; // 1..31
}

/** The seven dates of the week beginning at `weekStart` (a Monday), Mon→Sun. */
export function weekDays(weekStart: string): WeekDay[] {
  return WEEKDAYS.map((weekday, i) => {
    const iso = addDays(weekStart, i);
    return { weekday, iso, dayNum: Number(iso.slice(8, 10)) };
  });
}

/** Single WeekDay descriptor for `iso` (Day-view column). */
export function dayCell(iso: string): WeekDay {
  return { weekday: dowOf(iso), iso, dayNum: Number(iso.slice(8, 10)) };
}

export interface SessionView {
  session_id: string;
  date: string;
  weekday: string;
  batch_id: string;
  batchName: string;
  room_id: string;
  roomName: string;
  teacher_id: string;
  teacherName: string;
  start: string;
  end: string;
  status: string; // scheduled | extra | cancelled
  source: string; // recurring | adhoc
  projected?: boolean; // not yet persisted — a future recurring class beyond the generation horizon
}

export interface RecurringInstance {
  slot_id: string;
  batch_id: string;
  date: string;
  start: string;
  end: string;
  room_id: string;
  teacher_id: string;
}

/** Expand timetable rules into the recurring (slot, date) instances they want in
 *  [start, end] — the single source of truth for which recurring sessions should
 *  exist. Used by generation (to persist) and by the calendar (to project
 *  unwritten future weeks). Respects holidays, the rule's effective range, and
 *  the batch's expected_end_date cap. */
function expandRecurring(
  rules: TimetableRule[],
  holidays: Set<string>,
  batchEnd: Map<string, string>,
  start: string,
  end: string,
): RecurringInstance[] {
  const out: RecurringInstance[] = [];
  for (const r of rules) {
    const days = r.day_of_week.split(",").map((x) => x.trim());
    const endDate = batchEnd.get(r.batch_id) ?? "";
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (holidays.has(d)) continue;
      if (!days.includes(dowOf(d))) continue;
      if (endDate && d > endDate) break; // batch has ended
      if (!(r.effective_from <= d && (r.effective_to === "" || r.effective_to >= d))) continue;
      out.push({
        slot_id: r.slot_id, batch_id: r.batch_id, date: d,
        start: r.start, end: r.end, room_id: r.room_id, teacher_id: r.teacher_id,
      });
    }
  }
  return out;
}

/** Sessions to render on the calendar for [start, end]: persisted scheduled /
 *  extra / cancelled rows, PLUS projected recurring classes for any (slot, date)
 *  not yet written — so future weeks beyond the ~30-day generation horizon still
 *  show the planned schedule (read-only, no Sheets writes). Holidays show as
 *  gaps; cancelled are kept (rendered struck-through). */
export async function getSessionsInRange(start: string, end: string): Promise<SessionView[]> {
  const [sessions, batches, rooms, teachers, rules, holidaysTab] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Staff>("Staff"),
    readTab<TimetableRule>("Timetable"),
    readTab<{ date: string; name: string }>("Holidays"),
  ]);
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const rName = new Map(rooms.map((r) => [r.room_id, r.name]));
  const tName = new Map(teachers.map((t) => [t.teacher_id, t.name]));
  const named = (o: {
    batch_id: string;
    room_id: string;
    teacher_id: string;
  }) => ({
    batchName: bName.get(o.batch_id) ?? o.batch_id,
    roomName: rName.get(o.room_id) ?? o.room_id,
    teacherName: tName.get(o.teacher_id) ?? o.teacher_id,
  });

  const inRange = sessions.filter((s) => s.date >= start && s.date <= end);
  // Persisted recurring (slot|date) keys — any status — so we never double-show a
  // projected class where a real one (incl. cancelled) already exists.
  const persistedKeys = new Set(
    inRange.filter((s) => s.source === "recurring" && s.slot_id).map((s) => `${s.slot_id}|${s.date}`),
  );

  const persisted: SessionView[] = inRange
    .filter((s) => s.status === "scheduled" || s.status === "extra" || s.status === "cancelled")
    .map((s) => ({
      session_id: s.session_id,
      date: s.date,
      weekday: dowOf(s.date),
      batch_id: s.batch_id,
      room_id: s.room_id,
      teacher_id: s.teacher_id,
      ...named(s),
      start: s.start,
      end: s.end,
      status: s.status,
      source: s.source,
    }));

  const holidays = new Set(holidaysTab.map((h) => h.date));
  const batchEnd = new Map(batches.map((b) => [b.batch_id, b.expected_end_date ?? ""]));
  const projected: SessionView[] = expandRecurring(rules, holidays, batchEnd, start, end)
    .filter((inst) => !persistedKeys.has(`${inst.slot_id}|${inst.date}`))
    .map((inst) => ({
      session_id: `proj-${inst.slot_id}-${inst.date}`,
      date: inst.date,
      weekday: dowOf(inst.date),
      batch_id: inst.batch_id,
      room_id: inst.room_id,
      teacher_id: inst.teacher_id,
      ...named(inst),
      start: inst.start,
      end: inst.end,
      status: "scheduled",
      source: "recurring",
      projected: true,
    }));

  return [...persisted, ...projected].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthCell {
  iso: string;
  dayNum: number;
  inMonth: boolean;
  weekStart: string; // Monday of this date's week (the ?week= target)
}
export interface MonthGrid {
  label: string;
  weeks: MonthCell[][];
  prevAnchor: string; // a date in the previous month
  nextAnchor: string; // first day of the next month
}

/** 6×7 month matrix (Mon→Sun) for the mini-calendar of the month containing
 *  `anchorIso`. Each cell carries the Monday of its week so a click maps to a
 *  ?week= target. */
export function monthMatrix(anchorIso: string): MonthGrid {
  const [y, m] = anchorIso.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const gridStart = weekStartOf(firstOfMonth);
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDays(gridStart, w * 7 + i);
      row.push({
        iso,
        dayNum: Number(iso.slice(8, 10)),
        inMonth: Number(iso.slice(5, 7)) === m,
        weekStart: weekStartOf(iso),
      });
    }
    weeks.push(row);
  }
  return {
    label: `${MONTHS_FULL[m - 1]} ${y}`,
    weeks,
    prevAnchor: addDays(firstOfMonth, -1),
    nextAnchor: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`,
  };
}

export interface MonthRange {
  anchor: string; // YYYY-MM
  start: string; // YYYY-MM-01
  end: string; // YYYY-MM-<lastDay>
  label: string; // "June 2026"
  prev: string; // YYYY-MM
  next: string; // YYYY-MM
}

/** Bounds + label + neighbour anchors for the month containing `anchor` (YYYY-MM).
 *  The register's date math — start/end frame the Sheet read, prev/next drive nav. */
export function monthRange(anchor: string): MonthRange {
  const [y, m] = anchor.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  return {
    anchor: `${y}-${mm}`,
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTHS_FULL[m - 1]} ${y}`,
    prev: m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`,
    next: m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`,
  };
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

  const [rules, sessions, holidaysTab, attendance, batches] = await Promise.all([
    readTab<TimetableRule>("Timetable"),
    readTab<Session>("Sessions"),
    readTab<{ date: string; name: string }>("Holidays"),
    readTab<AttendanceRow>("Attendance"),
    readTab<Batch>("Batches"),
  ]);
  const holidays = new Set(holidaysTab.map((h) => h.date));
  const hasAttendance = new Set(attendance.map((a) => a.session_id));
  // Batch expected end date caps recurring generation (empty/missing = open-ended).
  const batchEnd = new Map(batches.map((b) => [b.batch_id, b.expected_end_date ?? ""]));

  // what the rules want in the window (shared expansion: holidays, effective
  // range, batch end-date cap)
  const instances = expandRecurring(rules, holidays, batchEnd, today, end);
  const desired = new Set(instances.map((i) => `${i.slot_id}|${i.date}`));

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

  // expand instances into row data for missing keys
  const appends: string[][] = [];
  for (const inst of instances) {
    if (existing.has(`${inst.slot_id}|${inst.date}`)) continue;
    const id = `SES${String(++max).padStart(4, "0")}`;
    appends.push([
      id, inst.date, inst.batch_id, inst.start, inst.end, inst.room_id, inst.teacher_id,
      "scheduled", "recurring", inst.slot_id,
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
  teachers: Staff[];
  cfg: Map<string, string>;
}

async function readHealthTabs(): Promise<HealthTabs> {
  const [sessions, enrolls, batches, rooms, teachers, cfg] = await Promise.all([
    readTab<Session>("Sessions"),
    readTab<Enrollment>("Enrollments"),
    readTab<Batch>("Batches"),
    readTab<Room>("Rooms"),
    readTab<Staff>("Staff"),
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
  const slotId = nextId(rules.map((x) => x.slot_id), "TT", 3);
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
    readTab<Staff>("Staff"),
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
  attended: number;
  total: number;
}

function aggregate(
  marks: AttendanceRow[],
  keyFn: (m: AttendanceRow) => string,
): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const mark of marks) {
    const k = keyFn(mark);
    const a = m.get(k) ?? { attended: 0, total: 0 };
    a.total += 1;
    if (isAttended(mark.status)) a.attended += 1;
    m.set(k, a);
  }
  return m;
}

const pct = (a: Agg) => (a.total ? a.attended / a.total : 0);

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
  /** Present/absent/late split of the latest marks — drives the attendance donut. */
  statusBreakdown: { present: number; absent: number; late: number };
  /** Daily attendance %, oldest→newest, continuous over the last 14 marked days'
   *  span. Unmarked days in range carry pct=null (gap) — drives the trend chart. */
  trend: { date: string; pct: number | null; attended: number; total: number }[];
  /** Threshold (consecutive absences) at which a student enters the follow-up list. */
  followupStreak: number;
  /** Active students on a current run of ≥ followupStreak absences — the acute
   *  "call the parent" list, distinct from the cumulative defaulters. Worst first. */
  followups: {
    id: string;
    name: string;
    parentPhone: string;
    batchName: string;
    streak: number;
    lastAttended: string; // date of their most recent present/late, "" if never
  }[];
}

export interface StatsTabs {
  attendance: AttendanceRow[];
  students: Student[];
  batches: Batch[];
  teachers: Staff[];
  cfg: Map<string, string>;
}

async function readStatsTabs(): Promise<StatsTabs> {
  const [attendance, students, batches, teachers, cfg] = await Promise.all([
    readTab<AttendanceRow>("Attendance"),
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
    readTab<Staff>("Staff"),
    config(),
  ]);
  return { attendance, students, batches, teachers, cfg };
}

export async function getOwnerStats(pre?: StatsTabs): Promise<OwnerStats> {
  const { attendance, students, batches, teachers, cfg } =
    pre ?? (await readStatsTabs());
  const threshold = parseInt(cfg.get("attendance_threshold") ?? "75", 10);
  const teacherById = new Map(teachers.map((t) => [t.teacher_id, t]));

  const marks = [...latestPerSessionStudent(attendance).values()];
  const studentById = new Map(students.map((s) => [s.student_id, s]));
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));

  const present = marks.filter((m) => m.status === "present").length;
  const late = marks.filter((m) => m.status === "late").length;
  const overall = marks.length ? (present + late) / marks.length : 0;

  const statusBreakdown = {
    present,
    absent: marks.filter((m) => m.status === "absent").length,
    late,
  };

  // Daily attendance %: a CONTINUOUS calendar range spanning the last 14 marked
  // days, so every date in between (incl. days with no sessions, e.g. a holiday)
  // still appears on the axis. Unmarked days carry pct=null → the chart bridges
  // them (connectNulls) but the date label is shown.
  const dayAgg = new Map<string, { attended: number; total: number }>();
  for (const m of marks) {
    const e = dayAgg.get(m.date) ?? { attended: 0, total: 0 };
    e.total++;
    if (isAttended(m.status)) e.attended++;
    dayAgg.set(m.date, e);
  }
  const markedDays = [...dayAgg.keys()].sort();
  const windowDays = markedDays.slice(-14);
  const trend: {
    date: string;
    pct: number | null;
    attended: number;
    total: number;
  }[] = [];
  if (windowDays.length) {
    const end = windowDays[windowDays.length - 1];
    let iso = windowDays[0];
    for (let i = 0; iso <= end && i < 400; i++) {
      const e = dayAgg.get(iso);
      trend.push({
        date: iso,
        pct: e ? e.attended / e.total : null,
        attended: e?.attended ?? 0,
        total: e?.total ?? 0,
      });
      const [y, mo, d] = iso.split("-").map(Number);
      iso = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
    }
  }

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

  // Absence follow-up: active students whose most-recent marked sessions are a run
  // of absences (≥ threshold). `marks` holds the winning mark per session, so
  // unmarked sessions aren't here (skipped); present/late breaks the run.
  const followupStreak = Math.max(2, parseInt(cfg.get("absence_followup_streak") ?? "3", 10) || 3);
  const byStudent = new Map<string, AttendanceRow[]>();
  for (const m of marks) {
    const arr = byStudent.get(m.student_id);
    if (arr) arr.push(m);
    else byStudent.set(m.student_id, [m]);
  }
  const followups = [...byStudent.entries()]
    .map(([id, rows]) => {
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));
      let streak = 0;
      let lastBatch = "";
      for (let i = rows.length - 1; i >= 0 && rows[i].status === "absent"; i--) {
        streak++;
        if (!lastBatch) lastBatch = rows[i].batch_id; // the class they're missing
      }
      let lastAttended = "";
      for (let i = rows.length - 1; i >= 0; i--) {
        if (isAttended(rows[i].status)) {
          lastAttended = rows[i].date;
          break;
        }
      }
      return { id, streak, lastBatch, lastAttended };
    })
    .filter((x) => x.streak >= followupStreak && studentById.get(x.id)?.status === "active")
    .map((x) => ({
      id: x.id,
      name: studentById.get(x.id)?.name ?? x.id,
      parentPhone: studentById.get(x.id)?.parent_phone ?? "",
      batchName: batchById.get(x.lastBatch)?.name ?? x.lastBatch,
      streak: x.streak,
      lastAttended: x.lastAttended,
    }))
    .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));

  return {
    overall,
    totalMarks: marks.length,
    threshold,
    studentCount: perStudent.size,
    defaulters,
    batchStats,
    manualCount: manual.length,
    recentManual,
    statusBreakdown,
    trend,
    followupStreak,
    followups,
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
      readTab<Staff>("Staff"),
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

// ---------------- C4 Staff (teaching + non-teaching) ----------------

/** The editable shape of a staff record (everything except id/pin/active, which
 *  are managed separately). `role`/`subjects` apply to teaching staff;
 *  `designation`/`department` to non-teaching. */
export interface StaffInput {
  name: string;
  phone: string;
  staff_type: "teaching" | "non_teaching";
  role: string; // "" | "teacher" | "owner" — login access (teaching only)
  subjects: string;
  designation: string;
  department: string;
  join_date: string;
  monthly_salary: string;
  notes: string;
}

export interface StaffView {
  teacher_id: string;
  name: string;
  phone: string;
  staff_type: "teaching" | "non_teaching";
  role: string; // login role; "" for non-teaching
  subjects: string;
  designation: string;
  department: string;
  active: boolean;
  hasPin: boolean;
  /** active batches this person teaches (teaching staff only; blocks deactivation). */
  batchCount: number;
  /** names of those active batches, sorted — shown on the card. */
  batchNames: string[];
}

/** Positional row (A..M) for the Staff tab. */
function staffRow(
  id: string,
  input: StaffInput,
  pinHash: string,
  active: string,
): string[] {
  return [
    id,
    input.name,
    input.phone,
    pinHash,
    input.role,
    input.subjects,
    active,
    input.staff_type,
    input.designation,
    input.department,
    input.join_date,
    input.monthly_salary,
    input.notes,
  ];
}

export async function listStaff(): Promise<StaffView[]> {
  const [staff, batches] = await Promise.all([
    readTab<Staff>("Staff"),
    readTab<Batch>("Batches"),
  ]);
  const bNames = new Map<string, string[]>();
  for (const b of batches)
    if (b.active === "TRUE") {
      const arr = bNames.get(b.teacher_id) ?? [];
      arr.push(b.name);
      bNames.set(b.teacher_id, arr);
    }
  return staff
    .map((s) => {
      const names = (bNames.get(s.teacher_id) ?? []).sort((a, b) => a.localeCompare(b));
      return {
        teacher_id: s.teacher_id,
        name: s.name,
        phone: s.phone,
        staff_type: staffTypeOf(s),
        role: s.role ?? "",
        subjects: s.subjects,
        designation: s.designation ?? "",
        department: s.department ?? "",
        active: s.active === "TRUE",
        hasPin: !!s.pin_hash && !s.pin_hash.startsWith("<"),
        batchCount: names.length,
        batchNames: names,
      };
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
}

export async function getStaff(id: string): Promise<Staff | null> {
  const staff = await readTab<Staff>("Staff");
  return staff.find((s) => s.teacher_id === id) ?? null;
}

export interface StaffBatch {
  batch_id: string;
  name: string;
  subject: string;
  level: string;
  active: boolean;
}

/** Batches assigned to a teaching staffer (active first, then by name) — for the
 *  staff profile page. Reads Batches only (1 read). */
export async function getStaffBatches(staffId: string): Promise<StaffBatch[]> {
  const batches = await readTab<Batch>("Batches");
  return batches
    .filter((b) => b.teacher_id === staffId)
    .map((b) => ({
      batch_id: b.batch_id,
      name: b.name,
      subject: b.subject,
      level: b.level,
      active: b.active === "TRUE",
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/** Is `phone` already used by another staffer? (login keys on phone — keep
 *  unique.) Empty phone is allowed for non-teaching staff and never collides. */
export async function staffPhoneTaken(
  phone: string,
  exceptId?: string,
): Promise<boolean> {
  const p = phone.trim();
  if (!p) return false;
  const staff = await readTab<Staff>("Staff");
  return staff.some((s) => s.phone === p && s.teacher_id !== exceptId);
}

export async function createStaff(
  input: StaffInput & { pinHash: string },
): Promise<string> {
  const staff = await readTab<Staff>("Staff");
  const prefix = input.staff_type === "non_teaching" ? "S" : "T";
  // nextId strips the prefix letters, so number each prefix's series independently
  const id = nextId(
    staff.filter((s) => s.teacher_id.startsWith(prefix)).map((s) => s.teacher_id),
    prefix,
    3,
  );
  await appendRows("Staff", [staffRow(id, input, input.pinHash, "TRUE")]);
  return id;
}

/** Update editable fields; pin_hash + active are preserved from the saved row. */
export async function updateStaff(id: string, input: StaffInput): Promise<void> {
  const staff = await readTab<Staff>("Staff");
  const idx = staff.findIndex((s) => s.teacher_id === id);
  if (idx < 0) return;
  const cur = staff[idx];
  await updateValues(`Staff!A${idx + 2}:M${idx + 2}`, [
    staffRow(id, input, cur.pin_hash, cur.active),
  ]);
}

export async function setStaffPin(id: string, pinHash: string): Promise<void> {
  const staff = await readTab<Staff>("Staff");
  const idx = staff.findIndex((s) => s.teacher_id === id);
  if (idx >= 0) await updateValues(`Staff!D${idx + 2}`, [[pinHash]]);
}

export async function setStaffActive(id: string, active: boolean): Promise<void> {
  const staff = await readTab<Staff>("Staff");
  const idx = staff.findIndex((s) => s.teacher_id === id);
  if (idx >= 0)
    await updateValues(`Staff!G${idx + 2}`, [[active ? "TRUE" : "FALSE"]]);
}

/** Number of active owners other than `exceptId` — guards the last-owner rule. */
export async function otherActiveOwners(exceptId: string): Promise<number> {
  const staff = await readTab<Staff>("Staff");
  return staff.filter(
    (s) => s.role === "owner" && s.active === "TRUE" && s.teacher_id !== exceptId,
  ).length;
}

// ---------------- C4b Staff attendance (daily register) ----------------

const STAFF_ATT_STATUSES: readonly StaffAttendanceStatus[] = [
  "present",
  "absent",
  "leave",
  "half_day",
];
export function isStaffAttendanceStatus(v: string): v is StaffAttendanceStatus {
  return (STAFF_ATT_STATUSES as readonly string[]).includes(v);
}

/** latest mark wins per key (timestamp, then log_id tiebreak). */
function pickLatest(
  map: Map<string, StaffAttendanceRow>,
  key: string,
  a: StaffAttendanceRow,
) {
  const prev = map.get(key);
  if (
    !prev ||
    a.timestamp > prev.timestamp ||
    (a.timestamp === prev.timestamp && a.log_id > prev.log_id)
  )
    map.set(key, a);
}

export interface StaffDayMark {
  staff_id: string;
  name: string;
  staff_type: "teaching" | "non_teaching";
  role: string; // sub-label: subjects (teaching) or designation (non-teaching)
  saved: StaffAttendanceStatus | null;
}

export interface StaffAttendanceBoard {
  date: string;
  prev: string;
  next: string;
  isFuture: boolean;
  rows: StaffDayMark[];
  summary: Record<StaffAttendanceStatus | "unmarked", number>;
}

/** The daily register: every ACTIVE staffer (teaching + non-teaching) with their
 *  mark for `date`. Reads Staff + StaffAttendance (2 reads; StaffAttendance via
 *  safeReadTab so an un-provisioned tab reads empty instead of erroring). */
export async function getStaffAttendanceBoard(dateArg: string): Promise<StaffAttendanceBoard> {
  const today = await effectiveToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : today;
  const [staff, att] = await Promise.all([
    readTab<Staff>("Staff"),
    safeReadTab<StaffAttendanceRow>("StaffAttendance"),
  ]);
  const byStaff = new Map<string, StaffAttendanceRow>();
  for (const a of att) if (a.date === date) pickLatest(byStaff, a.staff_id, a);

  const rows: StaffDayMark[] = staff
    .filter((s) => s.active === "TRUE")
    .map((s) => {
      const type = staffTypeOf(s);
      const saved = byStaff.get(s.teacher_id)?.status;
      return {
        staff_id: s.teacher_id,
        name: s.name,
        staff_type: type,
        role:
          type === "teaching"
            ? s.subjects || "Teacher"
            : s.designation || "Staff",
        saved: saved && isStaffAttendanceStatus(saved) ? saved : null,
      };
    })
    .sort((a, b) => {
      if (a.staff_type !== b.staff_type) return a.staff_type === "teaching" ? -1 : 1; // teaching first
      return a.name.localeCompare(b.name);
    });

  const summary: Record<StaffAttendanceStatus | "unmarked", number> = {
    present: 0,
    absent: 0,
    leave: 0,
    half_day: 0,
    unmarked: 0,
  };
  for (const r of rows) summary[r.saved ?? "unmarked"] += 1;

  return { date, prev: addDays(date, -1), next: addDays(date, 1), isFuture: date > today, rows, summary };
}

/** Upsert one day's staff marks by (staff_id, date): existing rows for `date` are
 *  updated in place, new staff appended. Pass only the marks that changed. */
export async function submitStaffAttendance(params: {
  date: string;
  markedBy: string;
  // status "" clears the day (blanks the existing row → reads as unmarked)
  marks: { staffId: string; status: StaffAttendanceStatus | ""; note?: string }[];
}): Promise<number> {
  if (params.marks.length === 0) return 0;
  const att = await safeReadTab<StaffAttendanceRow>("StaffAttendance");

  const rowByStaff = new Map<string, number>();
  const logByStaff = new Map<string, string>();
  let max = 0;
  att.forEach((a, i) => {
    const n = parseInt(a.log_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
    if (a.date === params.date) {
      rowByStaff.set(a.staff_id, i + 2);
      logByStaff.set(a.staff_id, a.log_id);
    }
  });

  const ts = centerTimestamp();
  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];
  let next = max;

  for (const m of params.marks) {
    const existingRow = rowByStaff.get(m.staffId);
    // clearing a day that was never marked is a no-op (don't append a blank row)
    if (!existingRow && m.status === "") continue;
    const logId = existingRow
      ? logByStaff.get(m.staffId)!
      : `SAT${String(++next).padStart(4, "0")}`;
    const row = [
      logId,
      m.staffId,
      params.date,
      m.status,
      params.markedBy,
      ts,
      (m.note ?? "").trim(),
    ];
    if (existingRow)
      updates.push({ range: `StaffAttendance!A${existingRow}:G${existingRow}`, values: [row] });
    else appends.push(row);
  }

  await Promise.all([
    updates.length ? batchUpdateValues(updates) : Promise.resolve(),
    appends.length ? appendRows("StaffAttendance", appends) : Promise.resolve(),
  ]);
  return params.marks.length;
}

export interface StaffAttendanceSummary {
  month: string; // YYYY-MM
  present: number;
  absent: number;
  leave: number;
  half_day: number;
  marked: number; // distinct days marked this month
}

/** This-month attendance tally for one staffer — for the profile card. Reads
 *  StaffAttendance only (1 read, safe). Latest mark per day wins. */
export async function getStaffAttendanceSummary(
  staffId: string,
  monthArg?: string,
): Promise<StaffAttendanceSummary> {
  const today = await effectiveToday();
  const month = validMonth(monthArg ?? "", today);
  const att = await safeReadTab<StaffAttendanceRow>("StaffAttendance");
  const byDate = new Map<string, StaffAttendanceRow>();
  for (const a of att)
    if (a.staff_id === staffId && a.date.startsWith(month)) pickLatest(byDate, a.date, a);

  const out: StaffAttendanceSummary = {
    month,
    present: 0,
    absent: 0,
    leave: 0,
    half_day: 0,
    marked: 0,
  };
  for (const a of byDate.values()) {
    if (isStaffAttendanceStatus(a.status)) {
      out[a.status] += 1;
      out.marked += 1;
    }
  }
  return out;
}

// ---------------- C4c Staff tasks / duties ----------------

const STAFF_TASK_STATUSES: readonly StaffTaskStatus[] = ["open", "done", "cancelled"];
export function isStaffTaskStatus(v: string): v is StaffTaskStatus {
  return (STAFF_TASK_STATUSES as readonly string[]).includes(v);
}

export interface StaffTaskView {
  task_id: string;
  staff_id: string;
  staff_name: string;
  title: string;
  detail: string;
  due_date: string;
  status: StaffTaskStatus;
  created: string;
  done_date: string;
  overdue: boolean;
}

export interface StaffTaskBoard {
  tasks: StaffTaskView[];
  /** active staff for the assignee picker */
  staffOptions: { id: string; name: string }[];
  counts: Record<StaffTaskStatus, number>;
}

const taskOpenRank = (s: StaffTaskStatus) => (s === "open" ? 0 : s === "done" ? 1 : 2);

/** Task board data — every task (assignee-named, overdue-flagged) + the active
 *  staff options for the quick-add picker + status counts. 3 reads (Config via
 *  effectiveToday, StaffTasks, Staff). */
export async function getStaffTaskBoard(): Promise<StaffTaskBoard> {
  const today = await effectiveToday();
  const [tasks, staff] = await Promise.all([
    safeReadTab<StaffTaskRow>("StaffTasks"),
    readTab<Staff>("Staff"),
  ]);
  const name = new Map(staff.map((s) => [s.teacher_id, s.name]));

  const views: StaffTaskView[] = tasks
    .map((t) => {
      const status = isStaffTaskStatus(t.status) ? t.status : "open";
      return {
        task_id: t.task_id,
        staff_id: t.staff_id,
        staff_name: name.get(t.staff_id) ?? t.staff_id,
        title: t.title,
        detail: t.detail,
        due_date: t.due_date,
        status,
        created: t.created,
        done_date: t.done_date,
        overdue: status === "open" && !!t.due_date && t.due_date < today,
      };
    })
    .sort((a, b) => {
      if (taskOpenRank(a.status) !== taskOpenRank(b.status))
        return taskOpenRank(a.status) - taskOpenRank(b.status);
      if (a.status === "open") {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const ad = a.due_date || "9999-99-99";
        const bd = b.due_date || "9999-99-99";
        if (ad !== bd) return ad < bd ? -1 : 1;
      }
      return b.created.localeCompare(a.created) || b.task_id.localeCompare(a.task_id);
    });

  const counts: Record<StaffTaskStatus, number> = { open: 0, done: 0, cancelled: 0 };
  for (const v of views) counts[v.status] += 1;

  const staffOptions = staff
    .filter((s) => s.active === "TRUE")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ id: s.teacher_id, name: s.name }));

  return { tasks: views, staffOptions, counts };
}

export async function createStaffTask(input: {
  staffId: string;
  title: string;
  detail: string;
  dueDate: string;
  createdBy: string;
}): Promise<string> {
  const today = await effectiveToday();
  const tasks = await safeReadTab<StaffTaskRow>("StaffTasks");
  const id = nextId(tasks.map((t) => t.task_id), "TSK", 4);
  await appendRows("StaffTasks", [
    [
      id,
      input.staffId,
      input.title,
      input.detail,
      input.dueDate,
      "open",
      today,
      "",
      input.createdBy,
    ],
  ]);
  return id;
}

export async function setStaffTaskStatus(
  taskId: string,
  status: StaffTaskStatus,
): Promise<void> {
  const today = await effectiveToday();
  const tasks = await safeReadTab<StaffTaskRow>("StaffTasks");
  const idx = tasks.findIndex((t) => t.task_id === taskId);
  if (idx < 0) return;
  const cur = tasks[idx];
  const doneDate = status === "done" ? cur.done_date || today : "";
  await updateValues(`StaffTasks!A${idx + 2}:I${idx + 2}`, [
    [
      cur.task_id,
      cur.staff_id,
      cur.title,
      cur.detail,
      cur.due_date,
      status,
      cur.created,
      doneDate,
      cur.created_by,
    ],
  ]);
}

/** Open tasks for one staffer — for the profile card. Reads StaffTasks only
 *  (1 read); due-soonest first. */
export async function getStaffOpenTasks(staffId: string): Promise<StaffTaskRow[]> {
  const tasks = await safeReadTab<StaffTaskRow>("StaffTasks");
  return tasks
    .filter(
      (t) =>
        t.staff_id === staffId && (!isStaffTaskStatus(t.status) || t.status === "open"),
    )
    .sort((a, b) => (a.due_date || "9999-99-99").localeCompare(b.due_date || "9999-99-99"));
}

// ---------------- C4d Payroll (salary adjustments + payments) ----------------

const intOf = (v: string): number => {
  // tolerate thousands separators / stray spaces in legacy cells ("20,000" → 20000);
  // keep a leading minus for signed adjustment amounts
  const n = parseInt(String(v).replace(/[,\s]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
};

/** Latest mark wins is N/A here; payroll just sums active rows for a period. */
export interface PayrollRow {
  staff_id: string;
  name: string;
  staff_type: "teaching" | "non_teaching";
  base: number; // Staff.monthly_salary
  adjustments: number; // net signed (active)
  paid: number; // Σ active payments
  due: number; // base + adjustments − paid
  status: "due" | "settled" | "credit";
}

export interface PayrollBoard {
  month: string;
  label: string;
  prev: string;
  next: string;
  rows: PayrollRow[];
  totals: { base: number; adjustments: number; paid: number; due: number };
}

const validMonth = (m: string, today: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);

/** Payroll board for a month: every active staffer's base/adjustments/paid/due,
 *  most-owed first, plus totals. 4 reads (Config, Staff, 2 ledgers via safeReadTab). */
export async function getPayrollBoard(monthArg: string): Promise<PayrollBoard> {
  const today = await effectiveToday();
  const month = validMonth(monthArg, today);
  const mr = monthRange(month);
  const [staff, adjs, pays] = await Promise.all([
    readTab<Staff>("Staff"),
    safeReadTab<SalaryAdjustmentRow>("SalaryAdjustments"),
    safeReadTab<SalaryPaymentRow>("SalaryPayments"),
  ]);

  const adjByStaff = new Map<string, number>();
  for (const a of adjs)
    if (a.period === month && a.status === "active")
      adjByStaff.set(a.staff_id, (adjByStaff.get(a.staff_id) ?? 0) + intOf(a.amount));
  const paidByStaff = new Map<string, number>();
  for (const p of pays)
    if (p.period === month && p.status === "active")
      paidByStaff.set(p.staff_id, (paidByStaff.get(p.staff_id) ?? 0) + intOf(p.amount));

  const rows: PayrollRow[] = staff
    .filter((s) => s.active === "TRUE")
    .map((s) => {
      const base = intOf(s.monthly_salary);
      const adjustments = adjByStaff.get(s.teacher_id) ?? 0;
      const paid = paidByStaff.get(s.teacher_id) ?? 0;
      const due = base + adjustments - paid;
      return {
        staff_id: s.teacher_id,
        name: s.name,
        staff_type: staffTypeOf(s),
        base,
        adjustments,
        paid,
        due,
        status: ledgerStatus(due),
      };
    })
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (t, r) => ({
      base: t.base + r.base,
      adjustments: t.adjustments + r.adjustments,
      paid: t.paid + r.paid,
      due: t.due + Math.max(0, r.due), // credits don't offset what's owed
    }),
    { base: 0, adjustments: 0, paid: 0, due: 0 },
  );

  return { month, label: mr.label, prev: mr.prev, next: mr.next, rows, totals };
}

export interface StaffPayrollDetail {
  staff: { id: string; name: string; staff_type: "teaching" | "non_teaching" };
  month: string;
  label: string;
  prev: string;
  next: string;
  base: number;
  adjustments: SalaryAdjustmentRow[]; // active first, newest-created first
  payments: SalaryPaymentRow[]; // active first, newest-timestamp first
  adjTotal: number;
  paid: number;
  due: number;
  status: "due" | "settled" | "credit";
}

/** One staffer's payroll ledger for a month — for the detail page. 4 reads. */
export async function getStaffPayroll(
  staffId: string,
  monthArg: string,
): Promise<StaffPayrollDetail | null> {
  const today = await effectiveToday();
  const month = validMonth(monthArg, today);
  const mr = monthRange(month);
  const [staffList, adjs, pays] = await Promise.all([
    readTab<Staff>("Staff"),
    safeReadTab<SalaryAdjustmentRow>("SalaryAdjustments"),
    safeReadTab<SalaryPaymentRow>("SalaryPayments"),
  ]);
  const s = staffList.find((x) => x.teacher_id === staffId);
  if (!s) return null;

  const rank = (st: string) => (st === "active" ? 0 : 1);
  const adjustments = adjs
    .filter((a) => a.staff_id === staffId && a.period === month)
    .sort((a, b) => rank(a.status) - rank(b.status) || b.created.localeCompare(a.created));
  const payments = pays
    .filter((p) => p.staff_id === staffId && p.period === month)
    .sort((a, b) => rank(a.status) - rank(b.status) || b.timestamp.localeCompare(a.timestamp));

  const base = intOf(s.monthly_salary);
  const adjTotal = adjustments
    .filter((a) => a.status === "active")
    .reduce((t, a) => t + intOf(a.amount), 0);
  const paid = payments
    .filter((p) => p.status === "active")
    .reduce((t, p) => t + intOf(p.amount), 0);
  const due = base + adjTotal - paid;

  return {
    staff: { id: s.teacher_id, name: s.name, staff_type: staffTypeOf(s) },
    month,
    label: mr.label,
    prev: mr.prev,
    next: mr.next,
    base,
    adjustments,
    payments,
    adjTotal,
    paid,
    due,
    status: ledgerStatus(due),
  };
}

export async function addSalaryAdjustment(input: {
  staffId: string;
  period: string;
  kind: SalaryAdjustmentKind;
  amount: number; // positive int from form
  note: string;
}): Promise<void> {
  const signed =
    input.kind === "deduction" ? -Math.abs(input.amount) : Math.abs(input.amount);
  const adjs = await safeReadTab<SalaryAdjustmentRow>("SalaryAdjustments");
  const id = nextId(adjs.map((a) => a.adj_id), "SADJ", 4);
  const created = await effectiveToday();
  await appendRows("SalaryAdjustments", [
    [id, input.staffId, input.period, input.kind, String(signed), input.note, "active", created],
  ]);
}

export async function voidSalaryAdjustment(adjId: string): Promise<void> {
  const adjs = await safeReadTab<SalaryAdjustmentRow>("SalaryAdjustments");
  const idx = adjs.findIndex((a) => a.adj_id === adjId);
  if (idx >= 0) await updateValues(`SalaryAdjustments!G${idx + 2}`, [["void"]]);
}

export async function recordSalaryPayment(input: {
  staffId: string;
  period: string;
  amount: number;
  date: string;
  method: FeeMethod;
  note: string;
}): Promise<void> {
  const pays = await safeReadTab<SalaryPaymentRow>("SalaryPayments");
  const id = nextId(pays.map((p) => p.pay_id), "SPAY", 4);
  await appendRows("SalaryPayments", [
    [
      id,
      input.staffId,
      input.period,
      String(input.amount),
      input.date,
      input.method,
      input.note,
      centerTimestamp(),
      "active",
    ],
  ]);
}

export async function voidSalaryPayment(payId: string): Promise<void> {
  const pays = await safeReadTab<SalaryPaymentRow>("SalaryPayments");
  const idx = pays.findIndex((p) => p.pay_id === payId);
  if (idx >= 0) await updateValues(`SalaryPayments!I${idx + 2}`, [["void"]]);
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

/** Portal login lookup: an active student whose own phone OR parent_phone matches.
 *  Both keys resolve to the same student, so student and parent share one portal
 *  scoped to that studentId. Returns null if no login (no/placeholder pin_hash). */
export async function getStudentByPhone(phone: string): Promise<Student | null> {
  const students = await readTab<Student>("Students");
  const p = phone.trim();
  return (
    students.find(
      (s) =>
        s.status === "active" &&
        (s.phone === p || s.parent_phone === p) &&
        !!s.pin_hash &&
        !s.pin_hash.startsWith("<"),
    ) ?? null
  );
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
  attended: number; // present + late (late counts as attended)
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
  const marks = [
    ...latestPerSessionStudent(attendance.filter((a) => a.student_id === id)).values(),
  ];
  const attended = marks.filter((m) => isAttended(m.status)).length;
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
    attended,
    total: marks.length,
    pct: marks.length ? attended / marks.length : 0,
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
  expected_end_date: string;
}

export async function listBatches(): Promise<BatchView[]> {
  const [batches, teachers, rooms, enrolls] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Staff>("Staff"),
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
      expected_end_date: b.expected_end_date ?? "",
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
  start_date: string;
  expected_end_date: string;
}): Promise<string> {
  const batches = await readTab<Batch>("Batches");
  const id = nextId(batches.map((b) => b.batch_id), "B", 3);
  await appendRows("Batches", [
    [
      id, input.name, input.subject, input.teacher_id, input.room_id, input.fee,
      input.level, "TRUE", input.start_date, input.expected_end_date,
    ],
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
    start_date: string;
    expected_end_date: string;
  },
): Promise<void> {
  const batches = await readTab<Batch>("Batches");
  const idx = batches.findIndex((b) => b.batch_id === id);
  if (idx < 0) return;
  const cur = batches[idx];
  await updateValues(`Batches!A${idx + 2}:J${idx + 2}`, [
    [
      id, input.name, input.subject, input.teacher_id, input.room_id, input.fee,
      input.level, cur.active, input.start_date, input.expected_end_date,
    ],
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
  /** the syllabus this batch maps to (by subject + level), or null if none. */
  course: Course | null;
  /** curriculum pacing summary for the card, or null when no course maps (P3). */
  progress: ProgressSummary | null;
}

export async function getBatchDetail(id: string): Promise<BatchDetail | null> {
  // one Config read (cfgMap) serves both `today` and the term bounds — avoids
  // the double read that getCenterConfig() + effectiveToday() would incur
  const [batches, teachers, rooms, students, enrolls, courses, chapters, progressRows, cfgMap] =
    await Promise.all([
      readTab<Batch>("Batches"),
      readTab<Staff>("Staff"),
      readTab<Room>("Rooms"),
      readTab<Student>("Students"),
      readTab<Enrollment>("Enrollments"),
      readTab<Course>("Courses"),
      readTab<Chapter>("Chapters"),
      readTab<BatchProgressRow>("BatchProgress"),
      config(),
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
  const course = findCourseForBatch(courses, batch);
  const progress = getBatchProgressSummary(
    batch,
    { chapters, progress: progressRows, course },
    { start: cfgMap.get("term_start") ?? "", end: cfgMap.get("term_end") ?? "" },
    todayFromCfg(cfgMap),
  );
  return {
    batch,
    teacherName: teachers.find((t) => t.teacher_id === batch.teacher_id)?.name ?? batch.teacher_id,
    roomName: rooms.find((r) => r.room_id === batch.room_id)?.name ?? batch.room_id,
    enrollments,
    candidates,
    course,
    progress,
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
    refs.teacherId ? readTab<Staff>("Staff") : Promise.resolve<Staff[]>([]),
    refs.studentId ? readTab<Student>("Students") : Promise.resolve<Student[]>([]),
  ]);
  if (refs.batchId) {
    const b = batches.find((x) => x.batch_id === refs.batchId);
    if (!b || b.active !== "TRUE") return false;
  }
  if (refs.roomId && !rooms.some((x) => x.room_id === refs.roomId)) return false;
  if (refs.teacherId) {
    const t = teachers.find((x) => x.teacher_id === refs.teacherId);
    // must exist AND be teaching staff (a non-teaching staffer can't teach)
    if (!t || staffTypeOf(t) !== "teaching") return false;
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
  teachers: Staff[];
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

  // An unassigned session is a hole, not a blank. The dangling-ref checks above
  // deliberately skip empty ids (`s.teacher_id && ...`), so a cleared cell was
  // invisible — yet ownership checks compare teacher ids, so a blank one means
  // "belongs to nobody" and every read of it is ambiguous. Surface it.
  for (const s of tabs.sessions) {
    if (s.status === "cancelled") continue;
    if (!s.teacher_id) issues.push({ kind: "session", detail: `${s.session_id} → no teacher assigned` });
  }

  // Duplicate primary keys. nextId() is max-suffix+1 over a snapshot, so two
  // writes racing on the same tab can mint the same id — Sheets has no unique
  // constraint to reject it. Rare at one-centre scale and cheap to detect, so
  // detect rather than re-architect ids; row-by-id lookups take the first match
  // and silently ignore the rest.
  const dupes = (ids: string[], kind: string) => {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (seen.has(id) && !reported.has(id)) {
        issues.push({ kind, detail: `duplicate id ${id}` });
        reported.add(id);
      }
      seen.add(id);
    }
  };
  dupes(tabs.sessions.map((s) => s.session_id), "session");
  dupes(tabs.enrolls.map((e) => e.enroll_id), "enrollment");
  dupes(tabs.students.map((s) => s.student_id), "student");
  dupes(tabs.batches.map((b) => b.batch_id), "batch");
  dupes(tabs.teachers.map((t) => t.teacher_id), "staff");
  dupes(tabs.rooms.map((r) => r.room_id), "room");

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
    readTab<Staff>("Staff"),
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
  /** Min consecutive absences before a student shows in the follow-up list. */
  absence_followup_streak: string;
  week_start: string;
  logo_url: string;
  room_changeover_buffer_min: string;
  /** Academic term bounds (YYYY-MM-DD) — drive curriculum "on-track" pacing.
   *  Empty when unset, in which case the on-track verdict is hidden (P3). */
  term_start: string;
  term_end: string;
}

const CONFIG_KEYS: (keyof CenterConfig)[] = [
  "center_name",
  "timezone",
  "attendance_threshold",
  "absence_followup_streak",
  "week_start",
  "logo_url",
  "room_changeover_buffer_min",
  "term_start",
  "term_end",
];

export async function getCenterConfig(): Promise<CenterConfig> {
  const m = await config();
  return {
    center_name: m.get("center_name") ?? "",
    timezone: m.get("timezone") ?? (process.env.CENTER_TZ ?? "Asia/Kolkata"),
    attendance_threshold: m.get("attendance_threshold") ?? "75",
    absence_followup_streak: m.get("absence_followup_streak") ?? "3",
    week_start: m.get("week_start") ?? "Mon",
    logo_url: m.get("logo_url") ?? "",
    room_changeover_buffer_min: m.get("room_changeover_buffer_min") ?? "0",
    term_start: m.get("term_start") ?? "",
    term_end: m.get("term_end") ?? "",
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

// ============================================================================
// Curriculum — courses (a syllabus per subject + level) and their chapters
// ============================================================================

/** Sort key for a class level like "Class 10" → 10 (non-numeric → last). */
function levelRank(level: string): number {
  const n = parseInt(level.replace(/\D+/g, ""), 10);
  return Number.isFinite(n) ? n : 999;
}

export interface CourseView {
  course_id: string;
  subject: string;
  level: string;
  name: string;
  description: string;
  active: boolean;
  chapters: number;
}

/** All courses with their chapter counts, ordered by level then subject. */
export async function listCourses(): Promise<CourseView[]> {
  const [courses, chapters] = await Promise.all([
    readTab<Course>("Courses"),
    readTab<Chapter>("Chapters"),
  ]);
  const count = new Map<string, number>();
  for (const ch of chapters)
    count.set(ch.course_id, (count.get(ch.course_id) ?? 0) + 1);
  return courses
    .map((c) => ({
      course_id: c.course_id,
      subject: c.subject,
      level: c.level,
      name: c.name,
      description: c.description,
      active: c.active === "TRUE",
      chapters: count.get(c.course_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        levelRank(a.level) - levelRank(b.level) ||
        a.subject.localeCompare(b.subject),
    );
}

export interface CourseDetail {
  course: Course;
  chapters: Chapter[]; // ordered by `order`
}

export async function getCourseDetail(id: string): Promise<CourseDetail | null> {
  const [courses, chapters] = await Promise.all([
    readTab<Course>("Courses"),
    readTab<Chapter>("Chapters"),
  ]);
  const course = courses.find((c) => c.course_id === id);
  if (!course) return null;
  const own = chapters
    .filter((ch) => ch.course_id === id)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return { course, chapters: own };
}

// ---- P2: course CRUD (soft-deactivate, never hard-delete — batches reference
// courses by subject+level, so a delete would orphan that mapping). Columns:
// A course_id, B subject, C level, D name, E description, F active. ----

export async function getCourse(id: string): Promise<Course | null> {
  const courses = await readTab<Course>("Courses");
  return courses.find((c) => c.course_id === id) ?? null;
}

export async function createCourse(input: {
  subject: string;
  level: string;
  name: string;
  description: string;
}): Promise<string> {
  const courses = await readTab<Course>("Courses");
  const id = nextId(courses.map((c) => c.course_id), "C", 3);
  await appendRows("Courses", [
    [id, input.subject, input.level, input.name, input.description, "TRUE"],
  ]);
  return id;
}

/** Update editable fields; `active` is preserved from the saved row. */
export async function updateCourse(
  id: string,
  input: { subject: string; level: string; name: string; description: string },
): Promise<void> {
  const courses = await readTab<Course>("Courses");
  const idx = courses.findIndex((c) => c.course_id === id);
  if (idx < 0) return;
  const cur = courses[idx];
  await updateValues(`Courses!A${idx + 2}:F${idx + 2}`, [
    [id, input.subject, input.level, input.name, input.description, cur.active],
  ]);
}

export async function setCourseActive(id: string, active: boolean): Promise<void> {
  const courses = await readTab<Course>("Courses");
  const idx = courses.findIndex((c) => c.course_id === id);
  if (idx >= 0)
    await updateValues(`Courses!F${idx + 2}`, [[active ? "TRUE" : "FALSE"]]);
}

// ---- P2: chapter CRUD + reorder. Columns: A chapter_id, B course_id,
// C order, D title, E topics, F resource_url. ----

/** Append a chapter to the end of its course's ordering (max order + 1). */
export async function createChapter(input: {
  course_id: string;
  title: string;
  topics: string;
  resource_url: string;
}): Promise<string> {
  const chapters = await readTab<Chapter>("Chapters");
  const id = nextId(chapters.map((c) => c.chapter_id), "CH", 3);
  const maxOrder = chapters
    .filter((c) => c.course_id === input.course_id)
    .reduce((m, c) => Math.max(m, Number(c.order) || 0), 0);
  await appendRows("Chapters", [
    [
      id,
      input.course_id,
      String(maxOrder + 1),
      input.title,
      input.topics,
      input.resource_url,
    ],
  ]);
  return id;
}

/** Update title/topics/resource; course_id + order are preserved (reordering
 *  is a separate op). */
export async function updateChapter(
  id: string,
  input: { title: string; topics: string; resource_url: string },
): Promise<void> {
  const chapters = await readTab<Chapter>("Chapters");
  const idx = chapters.findIndex((c) => c.chapter_id === id);
  if (idx < 0) return;
  const cur = chapters[idx];
  await updateValues(`Chapters!A${idx + 2}:F${idx + 2}`, [
    [id, cur.course_id, cur.order, input.title, input.topics, input.resource_url],
  ]);
}

/** Delete a chapter, then renumber its course's survivors 1..n (no gaps). */
export async function deleteChapter(id: string): Promise<void> {
  const chapters = await readTab<Chapter>("Chapters");
  const idx = chapters.findIndex((c) => c.chapter_id === id);
  if (idx < 0) return;
  const target = chapters[idx];
  await deleteRows("Chapters", [idx + 2]);
  // re-read (row numbers shift after the delete) and resequence the siblings
  const remaining = await readTab<Chapter>("Chapters");
  const updates = remaining
    .map((c, i) => ({ ...c, row: i + 2 }))
    .filter((c) => c.course_id === target.course_id)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((c, i) => ({ row: c.row, was: c.order, now: String(i + 1) }))
    .filter((u) => u.was !== u.now)
    .map((u) => ({ range: `Chapters!C${u.row}`, values: [[u.now]] }));
  await batchUpdateValues(updates);
}

/**
 * Move a chapter one slot up/down within its course. Swaps positions among the
 * sorted siblings, then renumbers them 1..n and writes only the rows whose order
 * actually changed (one batch request). Renumbering also self-heals any gaps or
 * duplicate order values left by manual sheet edits. No-op at the list edge.
 */
export async function moveChapter(id: string, dir: "up" | "down"): Promise<void> {
  const chapters = await readTab<Chapter>("Chapters");
  const target = chapters.find((c) => c.chapter_id === id);
  if (!target) return;
  const sibs = chapters
    .map((c, i) => ({ id: c.chapter_id, order: c.order, row: i + 2 }))
    .filter((c) => chapters[c.row - 2].course_id === target.course_id)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const pos = sibs.findIndex((c) => c.id === id);
  const swap = dir === "up" ? pos - 1 : pos + 1;
  if (pos < 0 || swap < 0 || swap >= sibs.length) return; // already at the edge
  [sibs[pos], sibs[swap]] = [sibs[swap], sibs[pos]];
  const updates = sibs
    .map((c, i) => ({ row: c.row, was: c.order, now: String(i + 1) }))
    .filter((u) => u.was !== u.now)
    .map((u) => ({ range: `Chapters!C${u.row}`, values: [[u.now]] }));
  await batchUpdateValues(updates);
}

// ============================================================================
// P3 — per-batch curriculum progress (the Edmingle differentiator). A batch
// teaches its mapped course's chapters; we track per-chapter status and pace
// it against the academic term. Tab BatchProgress: A batch_id, B chapter_id,
// C status, D done_date. An absent (batch, chapter) row reads as "pending".
// ============================================================================

export type ProgressStatus = "pending" | "in_progress" | "done";
const PROGRESS_STATUSES: readonly ProgressStatus[] = [
  "pending",
  "in_progress",
  "done",
];
export function isProgressStatus(s: string): s is ProgressStatus {
  return (PROGRESS_STATUSES as readonly string[]).includes(s);
}

/** Whole days from `a` to `b` (YYYY-MM-DD), tz-independent. Negative if b<a. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

export interface ProgressSummary {
  total: number;
  done: number;
  inProgress: number;
  /** Fraction of chapters done, 0..1 (0 when the course has no chapters). */
  pct: number;
  /** Fraction of the term elapsed today, 0..1 — null when term dates are unset
   *  or invalid (then the on-track verdict is suppressed). */
  termElapsedPct: number | null;
  /** done% ≥ term-elapsed% → on track (or ahead); null when no term bounds. */
  onTrack: boolean | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Pure: fold chapter statuses + term bounds into a paced summary. */
function computeProgressSummary(
  statuses: ProgressStatus[],
  term: { start: string; end: string },
  today: string,
): ProgressSummary {
  const total = statuses.length;
  const done = statuses.filter((s) => s === "done").length;
  const inProgress = statuses.filter((s) => s === "in_progress").length;
  const pct = total ? done / total : 0;

  let termElapsedPct: number | null = null;
  const validTerm =
    /^\d{4}-\d{2}-\d{2}$/.test(term.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(term.end) &&
    term.end > term.start;
  if (validTerm) {
    const span = daysBetween(term.start, term.end);
    termElapsedPct = clamp01(daysBetween(term.start, today) / span);
  }
  return {
    total,
    done,
    inProgress,
    pct,
    termElapsedPct,
    // ahead/on-track requires a term AND at least one chapter to pace
    onTrack: termElapsedPct === null || total === 0 ? null : pct >= termElapsedPct,
  };
}

/** Status map (chapter_id → status) for one batch, ignoring rows for chapters
 *  outside the given set. Absent chapters default to "pending". */
function progressMap(
  rows: BatchProgressRow[],
  batchId: string,
): Map<string, ProgressStatus> {
  const m = new Map<string, ProgressStatus>();
  for (const r of rows) {
    if (r.batch_id !== batchId) continue;
    if (isProgressStatus(r.status)) m.set(r.chapter_id, r.status);
  }
  return m;
}

export interface ChapterProgress extends Chapter {
  status: ProgressStatus;
  done_date: string;
}

export interface BatchProgressView {
  batch: Batch;
  course: Course | null;
  chapters: ChapterProgress[];
  summary: ProgressSummary;
  term: { start: string; end: string };
}

/** Full per-chapter progress view for a batch's mapped (active) course. */
export async function getBatchProgress(
  batchId: string,
): Promise<BatchProgressView | null> {
  const [batches, courses, chapters, progress, cfgMap] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Course>("Courses"),
    readTab<Chapter>("Chapters"),
    readTab<BatchProgressRow>("BatchProgress"),
    config(),
  ]);
  const batch = batches.find((b) => b.batch_id === batchId);
  if (!batch) return null;
  const today = todayFromCfg(cfgMap);
  const course = findCourseForBatch(courses, batch);

  const statusOf = progressMap(progress, batchId);
  const doneDateOf = new Map(
    progress
      .filter((r) => r.batch_id === batchId)
      .map((r) => [r.chapter_id, r.done_date]),
  );
  const own: ChapterProgress[] = course
    ? chapters
        .filter((ch) => ch.course_id === course.course_id)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((ch) => ({
          ...ch,
          status: statusOf.get(ch.chapter_id) ?? "pending",
          done_date: doneDateOf.get(ch.chapter_id) ?? "",
        }))
    : [];

  const term = {
    start: cfgMap.get("term_start") ?? "",
    end: cfgMap.get("term_end") ?? "",
  };
  const summary = computeProgressSummary(own.map((c) => c.status), term, today);
  return { batch, course, chapters: own, summary, term };
}

// ---------------- Attendance register (per-batch month grid) ----------------

export type RegisterState =
  | AttendanceStatus // present | absent | late (an actual mark)
  | "unmarked" // past/today, enrolled, no mark — the actionable gap
  | "cancelled"
  | "not-enrolled" // enrollment didn't cover this date
  | "upcoming"; // session is in the future

export interface RegisterColumn {
  session_id: string;
  date: string;
  start: string;
  dayNum: number;
  weekday: string;
  cancelled: boolean;
}

export interface RegisterRow {
  student_id: string;
  name: string;
  active: boolean;
  states: RegisterState[]; // aligned 1:1 with columns
  attended: number; // present + late, over the marked sessions this month
  marked: number; // present + absent + late this month (the rate denominator)
  pct: number | null; // attended/marked, or null when nothing's marked yet
}

export interface BatchRegister {
  batch: Batch;
  month: MonthRange;
  columns: RegisterColumn[];
  rows: RegisterRow[];
  threshold: number;
}

/**
 * One batch's attendance as a students × sessions grid for a month. A cell is the
 * latest mark, or a reason it's blank (cancelled / not-yet-enrolled / future /
 * unmarked). An `unmarked` cell on a past session is the actionable gap — clicking
 * the column header opens that session to mark. 5 tab reads + 1 config (single
 * config serves `today` + threshold, the getBatchDetail pattern).
 */
export async function getBatchRegister(
  batchId: string,
  monthAnchor: string,
): Promise<BatchRegister | null> {
  const [batches, enrolls, students, sessions, attendance, cfgMap] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Enrollment>("Enrollments"),
    readTab<Student>("Students"),
    readTab<Session>("Sessions"),
    readTab<AttendanceRow>("Attendance"),
    config(),
  ]);
  const batch = batches.find((b) => b.batch_id === batchId);
  if (!batch) return null;
  const today = todayFromCfg(cfgMap);
  // default to the current centre month when no valid YYYY-MM is given (one
  // config read serves today + threshold + the anchor fallback)
  const month = monthRange(/^\d{4}-(0[1-9]|1[0-2])$/.test(monthAnchor) ? monthAnchor : today.slice(0, 7));
  const threshold = parseInt(cfgMap.get("attendance_threshold") ?? "75", 10);

  // Columns: this batch's sessions in the month (cancelled kept, struck in the UI).
  const columns: RegisterColumn[] = sessions
    .filter((s) => s.batch_id === batchId && s.date >= month.start && s.date <= month.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((s) => ({
      session_id: s.session_id,
      date: s.date,
      start: s.start,
      dayNum: Number(s.date.slice(8, 10)),
      weekday: dowOf(s.date),
      cancelled: s.status === "cancelled",
    }));

  // Latest mark per (session, student), pre-filtered to this batch + month.
  const latest = latestPerSessionStudent(
    attendance.filter(
      (a) => a.batch_id === batchId && a.date >= month.start && a.date <= month.end,
    ),
  );

  // Rows: students whose enrollment in this batch overlaps the month (active or left,
  // so a mid-month leaver still shows their partial row — and inactive students keep
  // their history). Per-cell `not-enrolled` handles the late joiner.
  const enrollsByStudent = new Map<string, Enrollment[]>();
  for (const e of enrolls) {
    if (e.batch_id !== batchId) continue;
    if (e.status !== "active" && e.status !== "left") continue;
    if (e.start_date > month.end || (e.end_date !== "" && e.end_date < month.start)) continue;
    if (!enrollsByStudent.has(e.student_id)) enrollsByStudent.set(e.student_id, []);
    enrollsByStudent.get(e.student_id)!.push(e);
  }
  const studentById = new Map(students.map((s) => [s.student_id, s]));

  const rows: RegisterRow[] = [...enrollsByStudent.keys()]
    .map((id) => studentById.get(id))
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const ens = enrollsByStudent.get(s.student_id)!;
      let attended = 0;
      let marked = 0;
      const states = columns.map((col): RegisterState => {
        if (col.cancelled) return "cancelled";
        if (!ens.some((e) => enrollmentOnDate(e, col.date))) return "not-enrolled";
        const mark = latest.get(`${col.session_id}|${s.student_id}`);
        if (mark) {
          marked++;
          if (isAttended(mark.status)) attended++;
          return mark.status;
        }
        return col.date > today ? "upcoming" : "unmarked";
      });
      return {
        student_id: s.student_id,
        name: s.name,
        active: s.status === "active",
        states,
        attended,
        marked,
        pct: marked ? attended / marked : null,
      };
    });

  return { batch, month, columns, rows, threshold };
}

/** The active course a batch maps to, by case-insensitive subject + level. The
 *  single source of this join — keeps the `active === "TRUE"` filter consistent
 *  across getBatchDetail / getBatchProgress (used to drift apart). */
export function findCourseForBatch(courses: Course[], batch: Batch): Course | null {
  const key = (s: string) => s.trim().toLowerCase();
  return (
    courses.find(
      (c) =>
        c.active === "TRUE" &&
        key(c.subject) === key(batch.subject) &&
        key(c.level) === key(batch.level),
    ) ?? null
  );
}

/** Compact summary only (for the batch-detail card): folds the same inputs but
 *  skips building the per-chapter list. Pure/sync. Null when no course maps. */
function getBatchProgressSummary(
  batch: Batch,
  pre: { chapters: Chapter[]; progress: BatchProgressRow[]; course: Course | null },
  term: { start: string; end: string },
  today: string,
): ProgressSummary | null {
  if (!pre.course) return null;
  const statusOf = progressMap(pre.progress, batch.batch_id);
  const statuses = pre.chapters
    .filter((ch) => ch.course_id === pre.course!.course_id)
    .map((ch) => statusOf.get(ch.chapter_id) ?? "pending");
  return computeProgressSummary(statuses, term, today);
}

/**
 * Upsert one chapter's status for a batch. "done" stamps done_date with today;
 * any other status clears it. In-place on the existing (batch, chapter) row, or
 * appends a new one — never duplicates (mirrors submitAttendance).
 */
export async function setChapterProgress(
  batchId: string,
  chapterId: string,
  status: ProgressStatus,
): Promise<void> {
  const rows = await readTab<BatchProgressRow>("BatchProgress");
  const idx = rows.findIndex(
    (r) => r.batch_id === batchId && r.chapter_id === chapterId,
  );
  const doneDate = status === "done" ? await effectiveToday() : "";
  const row = [batchId, chapterId, status, doneDate];
  if (idx >= 0) {
    await updateValues(`BatchProgress!A${idx + 2}:D${idx + 2}`, [row]);
  } else {
    await appendRows("BatchProgress", [row]);
  }
}

export interface BatchRollupRow {
  batch_id: string;
  name: string;
  hasCourse: boolean;
  done: number;
  total: number;
  pct: number;
  onTrack: boolean | null;
}

export interface CurriculumRollup {
  batches: BatchRollupRow[]; // behind first, then lowest %, then name
  behind: number; // onTrack === false
  onTrackCount: number; // onTrack === true
  tracked: number; // mapped to a course that has chapters
  termSet: boolean;
}

/**
 * Curriculum pacing across every active batch — one Sheets pass, computed with
 * the same helpers as the batch page so the dashboard rollup and the per-batch
 * view always agree. Rows are ordered worst-first (behind → un-verdicted → on
 * track) so the dashboard surfaces problems at the top.
 */
export async function getCurriculumRollup(): Promise<CurriculumRollup> {
  const [batches, courses, chapters, progress, cfgMap] = await Promise.all([
    readTab<Batch>("Batches"),
    readTab<Course>("Courses"),
    readTab<Chapter>("Chapters"),
    readTab<BatchProgressRow>("BatchProgress"),
    config(),
  ]);
  const today = todayFromCfg(cfgMap);
  const term = {
    start: cfgMap.get("term_start") ?? "",
    end: cfgMap.get("term_end") ?? "",
  };
  const termSet =
    /^\d{4}-\d{2}-\d{2}$/.test(term.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(term.end) &&
    term.end > term.start;

  const rank = (r: BatchRollupRow) =>
    r.onTrack === false ? 0 : r.onTrack === null ? 1 : 2;

  const rows: BatchRollupRow[] = batches
    .filter((b) => b.active === "TRUE")
    .map((b) => {
      const course = findCourseForBatch(courses, b);
      if (!course) {
        return { batch_id: b.batch_id, name: b.name, hasCourse: false, done: 0, total: 0, pct: 0, onTrack: null };
      }
      const statusOf = progressMap(progress, b.batch_id);
      const statuses = chapters
        .filter((ch) => ch.course_id === course.course_id)
        .map((ch) => statusOf.get(ch.chapter_id) ?? "pending");
      const s = computeProgressSummary(statuses, term, today);
      return {
        batch_id: b.batch_id,
        name: b.name,
        hasCourse: true,
        done: s.done,
        total: s.total,
        pct: s.pct,
        onTrack: s.onTrack,
      };
    })
    .sort((a, b) => rank(a) - rank(b) || a.pct - b.pct || a.name.localeCompare(b.name));

  return {
    batches: rows,
    behind: rows.filter((r) => r.onTrack === false).length,
    onTrackCount: rows.filter((r) => r.onTrack === true).length,
    tracked: rows.filter((r) => r.hasCourse && r.total > 0).length,
    termSet,
  };
}

// ============================================================================
// Milestone E — reports / CSV exports (read-only, owner)
// ============================================================================

/**
 * RFC-4180 CSV: quote cells containing comma/quote/newline; CRLF line breaks.
 * Also neutralizes CSV/formula injection — a cell starting with = + - @ (or a
 * control char) is prefixed with ' so a malicious name like =HYPERLINK(...) is
 * not executed as a formula when the file is opened in Excel/Sheets.
 */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    let s = v ?? "";
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/**
 * Attendance log: the latest mark per (session, student), enriched with names,
 * optionally filtered by date range and/or batch. Newest first.
 */
export async function reportAttendance(opts: {
  from?: string;
  to?: string;
  batchId?: string;
}): Promise<string[][]> {
  const [attendance, students, batches, teachers] = await Promise.all([
    readTab<AttendanceRow>("Attendance"),
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
    readTab<Staff>("Staff"),
  ]);
  const sName = new Map(students.map((s) => [s.student_id, s.name]));
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const tName = new Map(teachers.map((t) => [t.teacher_id, t.name]));

  const filtered = attendance.filter(
    (a) =>
      (!opts.from || a.date >= opts.from) &&
      (!opts.to || a.date <= opts.to) &&
      (!opts.batchId || a.batch_id === opts.batchId),
  );
  const rows = [...latestPerSessionStudent(filtered).values()]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (bName.get(a.batch_id) ?? "").localeCompare(bName.get(b.batch_id) ?? "") ||
        (sName.get(a.student_id) ?? "").localeCompare(sName.get(b.student_id) ?? ""),
    )
    .map((a) => [
      a.date,
      bName.get(a.batch_id) ?? a.batch_id,
      sName.get(a.student_id) ?? a.student_id,
      a.status,
      a.method,
      tName.get(a.marked_by) ?? a.marked_by,
      a.reason ?? "",
      a.timestamp,
    ]);
  return [
    ["date", "batch", "student", "status", "method", "marked_by", "reason", "timestamp"],
    ...rows,
  ];
}

/** Defaulters (below threshold), as a CSV table. */
export async function reportDefaulters(): Promise<string[][]> {
  const stats = await getOwnerStats();
  return [
    ["student", "attendance_pct", "sessions", "threshold_pct"],
    ...stats.defaulters.map((d) => [
      d.name,
      String(Math.round(d.pct * 100)),
      String(d.total),
      String(stats.threshold),
    ]),
  ];
}

/** Per-batch attendance summary, as a CSV table. */
export async function reportBatches(): Promise<string[][]> {
  const stats = await getOwnerStats();
  return [
    ["batch", "attendance_pct", "marks"],
    ...stats.batchStats.map((b) => [
      b.name,
      String(Math.round(b.pct * 100)),
      String(b.total),
    ]),
  ];
}

/** One student's FULL attendance history, as a CSV table (no UI 100-row cap —
 *  an export must be complete). Latest mark per session, newest first. */
export async function reportStudent(studentId: string): Promise<string[][] | null> {
  const [students, attendance, batches] = await Promise.all([
    readTab<Student>("Students"),
    readTab<AttendanceRow>("Attendance"),
    readTab<Batch>("Batches"),
  ]);
  if (!students.some((s) => s.student_id === studentId)) return null;
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const rows = [
    ...latestPerSessionStudent(attendance.filter((a) => a.student_id === studentId)).values(),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp))
    .map((a) => [a.date, bName.get(a.batch_id) ?? a.batch_id, a.status, a.method]);
  return [["date", "batch", "status", "method"], ...rows];
}

// ============================================================================
// Fees — two-tab append-only ledger (FeeCharges + Payments).
// All money is in whole rupees (signed integers as strings in the Sheet).
// ============================================================================

// ---------------- Fees: kind + method guards ----------------

export const CHARGE_KINDS: readonly ChargeKind[] = [
  "monthly",
  "admission",
  "exam",
  "other",
  "discount",
];
export const FEE_METHODS: readonly FeeMethod[] = [
  "cash",
  "upi",
  "card",
  "bank",
  "cheque",
  "other",
];
export function isChargeKind(s: string): s is ChargeKind {
  return (CHARGE_KINDS as readonly string[]).includes(s);
}
export function isFeeMethod(s: string): s is FeeMethod {
  return (FEE_METHODS as readonly string[]).includes(s);
}

// ---------------- Fees: money parsing ----------------

/** Only integer strings (optionally negative) are valid money. A malformed cell
 *  returns null — never 0 — so a bad row is counted as an integrity issue rather
 *  than silently swallowed. This stops "NaN > 0 is false" from hiding defaulters. */
const MONEY = /^-?\d+$/;
function money(s: string): number | null {
  const t = (s ?? "").trim();
  return MONEY.test(t) ? parseInt(t, 10) : null;
}

/** Sum money strings; tracks malformed cells separately so callers can surface
 *  them via the integrity banner rather than silently dropping them. */
function sumMoney(values: string[]): { total: number; bad: number } {
  let total = 0;
  let bad = 0;
  for (const v of values) {
    const n = money(v);
    if (n === null) bad++;
    else total += n;
  }
  return { total, bad };
}

// ---------------- Fees: safeReadTab ----------------

/**
 * readTab wrapper that returns [] instead of throwing when the tab hasn't been
 * provisioned yet (HTTP 400 "Unable to parse range"). All other errors propagate.
 * Used for BOTH fees tabs so a missing tab degrades to "₹0 / no dues" on the
 * dashboard rather than a 500 (defence-in-depth behind the F0 provisioning gate).
 */
async function safeReadTab<T>(tab: string): Promise<T[]> {
  try {
    return await readTab<T>(tab);
  } catch (e: unknown) {
    const err = e as { code?: number; response?: { status?: number }; message?: string };
    if (
      (err?.code === 400 || err?.response?.status === 400) &&
      /Unable to parse range/i.test(err?.message ?? "")
    )
      return [];
    throw e;
  }
}

// ---------------- Fees: period helpers ----------------

/** Centre-local current month as YYYY-MM. Respects demo_today override. */
export async function currentPeriod(): Promise<string> {
  return (await effectiveToday()).slice(0, 7);
}

/** True when an enrollment overlaps a given YYYY-MM period. The `-99` sentinel
 *  compares lexicographically above any real day (e.g. "2026-06-99" > "2026-06-30"),
 *  so enrollments that started on ANY day of `period` are included. */
export function monthOverlaps(e: Enrollment, period: string): boolean {
  return (
    e.start_date <= `${period}-99` &&
    (e.end_date === "" || e.end_date >= `${period}-01`)
  );
}

// ---------------- Fees: per-student aggregation helpers ----------------

/** outstanding = Σ active-charge.amount(signed) − Σ active-payment.amount.
 *  Negative result = credit (student has overpaid or has more discounts than charges). */
function studentOutstanding(
  charges: FeeChargeRow[],
  payments: PaymentRow[],
): number {
  const { total: charged } = sumMoney(
    charges.filter((c) => c.status === "active").map((c) => c.amount),
  );
  const { total: paid } = sumMoney(
    payments.filter((p) => p.status === "active").map((p) => p.amount),
  );
  return charged - paid;
}

/** Ledger status derived from net outstanding. */
export function ledgerStatus(out: number): "due" | "settled" | "credit" {
  return out > 0 ? "due" : out === 0 ? "settled" : "credit";
}

/** Oldest due period for a student with outstanding > 0: earliest of
 *  (charge.period if non-empty, else charge.created.slice(0,7)) over active
 *  charges. Returns "" when outstanding ≤ 0 or there are no active charges. */
function oldestDue(charges: FeeChargeRow[], out: number): string {
  if (out <= 0) return "";
  const active = charges.filter((c) => c.status === "active");
  if (active.length === 0) return "";
  const months = active.map((c) =>
    c.period !== "" ? c.period : c.created.slice(0, 7),
  );
  return months.reduce((min, m) => (m < min ? m : min), months[0]);
}

// ---------------- Fees: reads ----------------

export interface StudentFeesResult {
  charges: FeeChargeRow[];   // active first, then void; within each group newest-created first
  payments: PaymentRow[];    // active first (newest timestamp); then void
  charged: number;           // Σ active charge amounts (signed, so discounts reduce this)
  paid: number;              // Σ active payment amounts
  outstanding: number;       // charged - paid
  credit: number;            // max(0, -outstanding) — positive when student overpaid
  status: "due" | "settled" | "credit";
}

/** Full ledger for one student: charges + payments with per-student aggregates. */
export async function getStudentFees(studentId: string): Promise<StudentFeesResult> {
  const [charges, payments] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    safeReadTab<PaymentRow>("Payments"),
  ]);

  const myCharges = charges.filter((c) => c.student_id === studentId);
  const myPayments = payments.filter((p) => p.student_id === studentId);

  // sort: active first, within group newest-created / newest-timestamp first
  const sortedCharges = [...myCharges].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    return aActive - bActive || b.created.localeCompare(a.created);
  });
  const sortedPayments = [...myPayments].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    return aActive - bActive || b.timestamp.localeCompare(a.timestamp);
  });

  const { total: charged } = sumMoney(
    myCharges.filter((c) => c.status === "active").map((c) => c.amount),
  );
  const { total: paid } = sumMoney(
    myPayments.filter((p) => p.status === "active").map((p) => p.amount),
  );
  const outstanding = charged - paid;

  return {
    charges: sortedCharges,
    payments: sortedPayments,
    charged,
    paid,
    outstanding,
    credit: Math.max(0, -outstanding),
    status: ledgerStatus(outstanding),
  };
}

export interface FeesRollupStudent {
  student_id: string;
  name: string;
  parent_phone: string;
  outstanding: number;
  oldestDue: string;
}

export interface FeesRollup {
  /** Σ max(0, per-student outstanding) — creditors don't offset debtors. */
  totalOutstanding: number;
  /** Σ max(0, -per-student outstanding) — shown separately. */
  totalCredit: number;
  studentsWithDues: number;
  /** Top defaulters, sorted descending by outstanding. */
  top: FeesRollupStudent[];
}

/** Centre-wide fees rollup for the dashboard KPI card. Includes inactive students
 *  who still have an outstanding balance (they owe money regardless of status). */
export async function getFeesRollup(): Promise<FeesRollup> {
  const [charges, payments, students] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    safeReadTab<PaymentRow>("Payments"),
    readTab<Student>("Students"),
  ]);

  const studentById = new Map(students.map((s) => [s.student_id, s]));

  // group by student
  const chargesByStudent = new Map<string, FeeChargeRow[]>();
  for (const c of charges) {
    if (!chargesByStudent.has(c.student_id)) chargesByStudent.set(c.student_id, []);
    chargesByStudent.get(c.student_id)!.push(c);
  }
  const paymentsByStudent = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!paymentsByStudent.has(p.student_id)) paymentsByStudent.set(p.student_id, []);
    paymentsByStudent.get(p.student_id)!.push(p);
  }

  // all student ids that appear in either tab (include inactive with balance)
  const allIds = new Set<string>([
    ...chargesByStudent.keys(),
    ...paymentsByStudent.keys(),
  ]);

  let totalOutstanding = 0;
  let totalCredit = 0;
  let studentsWithDues = 0;
  const top: FeesRollupStudent[] = [];

  for (const id of allIds) {
    const sc = chargesByStudent.get(id) ?? [];
    const sp = paymentsByStudent.get(id) ?? [];
    const out = studentOutstanding(sc, sp);
    totalOutstanding += Math.max(0, out);
    totalCredit += Math.max(0, -out);
    if (out > 0) {
      studentsWithDues++;
      const s = studentById.get(id);
      top.push({
        student_id: id,
        name: s?.name ?? id,
        parent_phone: s?.parent_phone ?? "",
        outstanding: out,
        oldestDue: oldestDue(sc, out),
      });
    }
  }

  top.sort((a, b) => b.outstanding - a.outstanding);

  return { totalOutstanding, totalCredit, studentsWithDues, top };
}

export interface FeesOverviewRow {
  student_id: string;
  name: string;
  active: boolean;
  charged: number;
  paid: number;
  outstanding: number;
  status: "due" | "settled" | "credit";
  oldestDue: string;
}

export interface FeesOverview {
  period: string;
  rows: FeesOverviewRow[];
  totalOutstanding: number;
  totalCredit: number;
  studentsWithDues: number;
  /** Σ active-payment.amount where payment.date.slice(0,7) === period (raw, not netted). */
  collectedThisPeriod: number;
  /** Σ active charge.amount (all kinds) where charge.period === period. Discounts reduce this. */
  expectedThisPeriod: number;
  /** Students where (expectedThisPeriod − collectedThisPeriod) > 0 for the selected period. */
  studentsWithDuesPeriod: number;
  /** Σ active monthly charge.amount where charge.period === period. */
  chargedThisPeriod: number;
  /** Count of malformed amount cells encountered across both tabs. */
  badCells: number;
}

/** Per-student fees overview for the /manage/fees page. `period` defaults to the
 *  current centre month. Includes all students who appear in either fees tab plus
 *  active students with no fees history (so the owner can add charges for them). */
export async function listFeesOverview(period?: string): Promise<FeesOverview> {
  const effectivePeriod = period ?? (await currentPeriod());

  const [charges, payments, students] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    safeReadTab<PaymentRow>("Payments"),
    readTab<Student>("Students"),
  ]);

  const studentById = new Map(students.map((s) => [s.student_id, s]));

  const chargesByStudent = new Map<string, FeeChargeRow[]>();
  for (const c of charges) {
    if (!chargesByStudent.has(c.student_id)) chargesByStudent.set(c.student_id, []);
    chargesByStudent.get(c.student_id)!.push(c);
  }
  const paymentsByStudent = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!paymentsByStudent.has(p.student_id)) paymentsByStudent.set(p.student_id, []);
    paymentsByStudent.get(p.student_id)!.push(p);
  }

  // union of ids: students in fees tabs + all currently active students
  const allIds = new Set<string>([
    ...chargesByStudent.keys(),
    ...paymentsByStudent.keys(),
    ...students.filter((s) => s.status === "active").map((s) => s.student_id),
  ]);

  let totalOutstanding = 0;
  let totalCredit = 0;
  let studentsWithDues = 0;
  let collectedThisPeriod = 0;
  let expectedThisPeriod = 0;
  let studentsWithDuesPeriod = 0;
  let chargedThisPeriod = 0;
  let badCells = 0;
  const rows: FeesOverviewRow[] = [];

  for (const id of allIds) {
    const sc = chargesByStudent.get(id) ?? [];
    const sp = paymentsByStudent.get(id) ?? [];

    const { total: charged, bad: badC } = sumMoney(
      sc.filter((c) => c.status === "active").map((c) => c.amount),
    );
    const { total: paid, bad: badP } = sumMoney(
      sp.filter((p) => p.status === "active").map((p) => p.amount),
    );
    badCells += badC + badP;

    const out = charged - paid;
    const s = studentById.get(id);

    totalOutstanding += Math.max(0, out);
    totalCredit += Math.max(0, -out);
    if (out > 0) studentsWithDues++;

    // period-specific aggregates
    const { total: periodPaid, bad: badPP } = sumMoney(
      sp
        .filter((p) => p.status === "active" && p.date.slice(0, 7) === effectivePeriod)
        .map((p) => p.amount),
    );
    badCells += badPP;
    collectedThisPeriod += periodPaid;

    const { total: periodExpected, bad: badPE } = sumMoney(
      sc
        .filter((c) => c.status === "active" && c.period === effectivePeriod)
        .map((c) => c.amount),
    );
    badCells += badPE;
    expectedThisPeriod += periodExpected;
    if (periodExpected - periodPaid > 0) studentsWithDuesPeriod++;

    const { total: periodCharged, bad: badPC } = sumMoney(
      sc
        .filter(
          (c) =>
            c.status === "active" &&
            c.kind === "monthly" &&
            c.period === effectivePeriod,
        )
        .map((c) => c.amount),
    );
    badCells += badPC;
    chargedThisPeriod += periodCharged;

    rows.push({
      student_id: id,
      name: s?.name ?? id,
      active: s?.status === "active",
      charged,
      paid,
      outstanding: out,
      status: ledgerStatus(out),
      oldestDue: oldestDue(sc, out),
    });
  }

  // sort: due first, then by outstanding desc, then name
  rows.sort(
    (a, b) =>
      (a.status === "due" ? 0 : a.status === "settled" ? 1 : 2) -
        (b.status === "due" ? 0 : b.status === "settled" ? 1 : 2) ||
      b.outstanding - a.outstanding ||
      a.name.localeCompare(b.name),
  );

  return {
    period: effectivePeriod,
    rows,
    totalOutstanding,
    totalCredit,
    studentsWithDues,
    collectedThisPeriod,
    expectedThisPeriod,
    studentsWithDuesPeriod,
    chargedThisPeriod,
    badCells,
  };
}

/** Redefine ManageCounts to include feesOutstanding. */
export interface ManageCountsWithFees extends ManageCounts {
  feesOutstanding: number;
}

/** Extended manage hub counts — includes outstanding fees KPI (uses safeReadTab
 *  so a missing FeeCharges/Payments tab returns 0 rather than a 500). */
export async function getManageCountsWithFees(): Promise<ManageCountsWithFees> {
  const [base, rollup] = await Promise.all([
    getManageCounts(),
    getFeesRollup(),
  ]);
  return { ...base, feesOutstanding: rollup.totalOutstanding };
}

/**
 * Sellable defaulters CSV: one row per student where charged ≠ paid OR who has
 * any charge at all. Includes inactive students (they still owe money). Sorted by
 * outstanding descending so the collector can work top-down.
 */
export async function reportFees(): Promise<string[][]> {
  const [charges, payments, students] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    safeReadTab<PaymentRow>("Payments"),
    readTab<Student>("Students"),
  ]);

  const studentById = new Map(students.map((s) => [s.student_id, s]));

  const chargesByStudent = new Map<string, FeeChargeRow[]>();
  for (const c of charges) {
    if (!chargesByStudent.has(c.student_id)) chargesByStudent.set(c.student_id, []);
    chargesByStudent.get(c.student_id)!.push(c);
  }
  const paymentsByStudent = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!paymentsByStudent.has(p.student_id)) paymentsByStudent.set(p.student_id, []);
    paymentsByStudent.get(p.student_id)!.push(p);
  }

  const allIds = new Set<string>([
    ...chargesByStudent.keys(),
    ...paymentsByStudent.keys(),
  ]);

  const rows: string[][] = [];
  for (const id of allIds) {
    const sc = chargesByStudent.get(id) ?? [];
    const sp = paymentsByStudent.get(id) ?? [];
    const { total: charged } = sumMoney(
      sc.filter((c) => c.status === "active").map((c) => c.amount),
    );
    const { total: paid } = sumMoney(
      sp.filter((p) => p.status === "active").map((p) => p.amount),
    );
    const out = charged - paid;
    const s = studentById.get(id);
    rows.push([
      s?.name ?? id,
      s?.parent_phone ?? "",
      String(charged),
      String(paid),
      String(out),
      String(Math.max(0, -out)),
      oldestDue(sc, out),
    ]);
  }

  rows.sort((a, b) => Number(b[4]) - Number(a[4]));

  return [
    ["student", "parent_phone", "charged", "paid", "outstanding", "credit", "oldest_due"],
    ...rows,
  ];
}

// ---------------- Fees: helper for discount bound ----------------

/** Current net outstanding for a student (used by addChargeAction to bound discounts). */
export async function currentNetOutstanding(studentId: string): Promise<number> {
  const [charges, payments] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    safeReadTab<PaymentRow>("Payments"),
  ]);
  return studentOutstanding(
    charges.filter((c) => c.student_id === studentId),
    payments.filter((p) => p.student_id === studentId),
  );
}

// ---------------- Fees: writes ----------------

/**
 * Generate monthly charge rows for every active enrollment that overlaps `period`.
 * Idempotent: skips any (student, batch, period) key that already has a monthly
 * charge (active OR void — void-respecting so a corrected void doesn't re-fire).
 * Appends all new rows in a single batch. Returns the count of rows written.
 */
export async function generateMonthlyCharges(period: string): Promise<number> {
  const [existingCharges, batches, enrollments] = await Promise.all([
    safeReadTab<FeeChargeRow>("FeeCharges"),
    readTab<Batch>("Batches"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const created = await effectiveToday();

  const batchById = new Map(batches.map((b) => [b.batch_id, b]));

  // de-dup key: student|batch|period for BOTH active and void monthly charges
  const existing = new Set(
    existingCharges
      .filter((c) => c.kind === "monthly")
      .map((c) => `${c.student_id}|${c.batch_id}|${c.period}`),
  );

  // compute maxN once from all charge ids
  let maxN = 0;
  for (const c of existingCharges) {
    const n = parseInt(c.charge_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > maxN) maxN = n;
  }

  const rows: string[][] = [];
  for (const e of enrollments) {
    if (e.status === "inactive") continue;
    if (!monthOverlaps(e, period)) continue;
    const b = batchById.get(e.batch_id);
    if (!b) continue;
    const fee = money(b.fee);
    if (fee === null || fee <= 0) continue;
    const key = `${e.student_id}|${e.batch_id}|${period}`;
    if (existing.has(key)) continue;
    existing.add(key); // guard against duplicate enrollments in the same batch
    rows.push([
      `FC${String(++maxN).padStart(4, "0")}`,
      e.student_id,
      e.batch_id,
      period,
      "monthly",
      String(fee),
      "",
      "active",
      created,
    ]);
  }

  await appendRows("FeeCharges", rows);
  return rows.length;
}

/** Append a one-off charge. `amount` is a positive integer from the form; the
 *  action layer negates it for discounts. `signed` encodes the correct sign here. */
export async function addCharge(input: {
  studentId: string;
  batchId: string;
  period: string;
  kind: ChargeKind;
  amount: number; // positive int from form
  note: string;
}): Promise<void> {
  const signed =
    input.kind === "discount" ? -Math.abs(input.amount) : Math.abs(input.amount);
  const charges = await safeReadTab<FeeChargeRow>("FeeCharges");
  const id = nextId(charges.map((c) => c.charge_id), "FC", 4);
  const created = await effectiveToday();
  await appendRows("FeeCharges", [
    [id, input.studentId, input.batchId, input.period || "", input.kind, String(signed), input.note, "active", created],
  ]);
}

/** Soft-void a charge by ID (fresh read → findIndex → single-cell update).
 *  Matched by charge_id so a concurrent append can't shift the wrong row. */
export async function voidCharge(chargeId: string): Promise<void> {
  const charges = await safeReadTab<FeeChargeRow>("FeeCharges");
  const idx = charges.findIndex((c) => c.charge_id === chargeId);
  if (idx < 0) return;
  await updateValues(`FeeCharges!H${idx + 2}`, [["void"]]);
}

/** Append a payment record. `amount` is a validated positive integer. */
export async function recordPayment(input: {
  studentId: string;
  amount: number;
  date: string;
  method: FeeMethod;
  note: string;
}): Promise<void> {
  const payments = await safeReadTab<PaymentRow>("Payments");
  const id = nextId(payments.map((p) => p.payment_id), "PMT", 4);
  await appendRows("Payments", [
    [id, input.studentId, String(input.amount), input.date, input.method, input.note, centerTimestamp(), "active"],
  ]);
}

/** Soft-void a payment by ID (fresh read → findIndex → single-cell update). */
export async function voidPayment(paymentId: string): Promise<void> {
  const payments = await safeReadTab<PaymentRow>("Payments");
  const idx = payments.findIndex((p) => p.payment_id === paymentId);
  if (idx < 0) return;
  await updateValues(`Payments!H${idx + 2}`, [["void"]]);
}

// ============================================================================
// PTM — parent–teacher meetings. Append-only ledger (like Fees); a scheduled
// row is completed in place. Reads degrade to empty via safeReadTab so a
// missing tab never 500s. The "to meet" list reuses getOwnerStats' attendance
// signals rather than re-deriving them.
// ============================================================================

// ponytail: 90-day PTM cadence hardcoded; lift to Config when a centre asks for
// per-centre cadence (wire exactly like absence_followup_streak).
const PTM_INTERVAL_DAYS = 90;

const PTM_MODES: readonly PtmMode[] = ["in_person", "call", "video"];
const PTM_STATUSES: readonly PtmStatus[] = ["scheduled", "done", "no_show", "cancelled", "void"];
export function isPtmMode(s: string): s is PtmMode {
  return (PTM_MODES as readonly string[]).includes(s);
}
export function isPtmStatus(s: string): s is PtmStatus {
  return (PTM_STATUSES as readonly string[]).includes(s);
}

/** Positional string array for one PtmRow (A..I column order). */
export function ptmRow(p: PtmRow): string[] {
  return [
    p.ptm_id,
    p.student_id,
    p.date,
    p.mode,
    p.met_with,
    p.teacher_id,
    p.summary,
    p.status,
    p.timestamp,
  ];
}

/** Append a PTM row. Covers both scheduling (status "scheduled") and logging a
 *  meeting that already happened (status "done"). */
export async function appendPtm(input: {
  studentId: string;
  date: string;
  mode: PtmMode;
  metWith: string;
  teacherId: string;
  summary: string;
  status: PtmStatus;
}): Promise<void> {
  const ptms = await safeReadTab<PtmRow>("PTM");
  const id = nextId(ptms.map((p) => p.ptm_id), "PTM", 4);
  await appendRows("PTM", [
    ptmRow({
      ptm_id: id,
      student_id: input.studentId,
      date: input.date,
      mode: input.mode,
      met_with: input.metWith,
      teacher_id: input.teacherId,
      summary: input.summary,
      status: input.status,
      timestamp: centerTimestamp(),
    }),
  ]);
}

/** Complete a scheduled meeting in place: fresh-read → match by ptm_id → merge
 *  the captured fields → write the whole row. Immutable cells (id, student,
 *  teacher, timestamp) are preserved from the existing row. No-op unless the row
 *  is currently "scheduled" (so a cancelled row can't be resurrected). */
export async function completePtm(input: {
  ptmId: string;
  date: string;
  mode: PtmMode;
  metWith: string;
  summary: string;
}): Promise<void> {
  const ptms = await safeReadTab<PtmRow>("PTM");
  const idx = ptms.findIndex((p) => p.ptm_id === input.ptmId);
  if (idx < 0 || ptms[idx].status !== "scheduled") return;
  const merged: PtmRow = {
    ...ptms[idx],
    date: input.date,
    mode: input.mode,
    met_with: input.metWith,
    summary: input.summary,
    status: "done",
  };
  await updateValues(`PTM!A${idx + 2}:I${idx + 2}`, [ptmRow(merged)]);
}

/** Set a PTM's status by ID (no_show / cancelled / void). Single-cell update,
 *  matched by ptm_id so a concurrent append can't shift the wrong row. */
export async function setPtmStatus(ptmId: string, status: PtmStatus): Promise<void> {
  const ptms = await safeReadTab<PtmRow>("PTM");
  const idx = ptms.findIndex((p) => p.ptm_id === ptmId);
  if (idx < 0) return;
  await updateValues(`PTM!H${idx + 2}`, [[status]]);
}

/** A student's meeting history (newest first), void rows excluded. The UI splits
 *  scheduled (upcoming, actionable) from done/no_show (history). */
export async function getStudentPtm(studentId: string): Promise<PtmRow[]> {
  const ptms = await safeReadTab<PtmRow>("PTM");
  return ptms
    .filter((p) => p.student_id === studentId && p.status !== "void")
    .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));
}

export interface PtmUpcoming {
  ptm_id: string;
  studentId: string;
  studentName: string;
  parentPhone: string;
  date: string;
  mode: string;
}

export interface PtmRecent {
  ptm_id: string;
  studentId: string;
  studentName: string;
  date: string;
  mode: string;
  met_with: string;
  summary: string;
  status: string;
}

export interface PtmDue {
  id: string;
  name: string;
  parentPhone: string;
  reasons: string[];
  flags: number;
  lastMet: string; // YYYY-MM-DD, "" if never met
  gapDays: number | null; // null = never met
}

export interface PtmBoard {
  upcoming: PtmUpcoming[];
  recent: PtmRecent[];
  due: PtmDue[];
  intervalDays: number;
}

/** Pure risk-rank: an active student is "to meet" if any signal fires — overdue
 *  meeting gap, low attendance, an absence streak, or fees due. flags = number
 *  of distinct signals; worst (most flags, then longest gap) first. Students who
 *  already have an upcoming scheduled meeting are excluded (don't nag the booked).
 *  "never met" only fires once a student has been enrolled longer than the
 *  interval — a brand-new joiner isn't overdue for a meeting, so the launch list
 *  isn't every student. Exported for the throwaway self-check. */
export function rankPtmDue(input: {
  students: { id: string; name: string; parentPhone: string; joinDate: string }[];
  lastMetById: Map<string, string>;
  defaulterPctById: Map<string, number>; // fraction 0..1, only below-threshold students
  streakById: Map<string, number>;
  outstandingById: Map<string, number>; // only students with outstanding > 0
  scheduledStudentIds: Set<string>;
  today: string;
  intervalDays: number;
}): PtmDue[] {
  const due: PtmDue[] = [];
  for (const s of input.students) {
    if (input.scheduledStudentIds.has(s.id)) continue;
    const lastMet = input.lastMetById.get(s.id) ?? "";
    const gapDays = lastMet ? daysBetween(lastMet, input.today) : null;
    const reasons: string[] = [];

    let meetingFlag = false;
    if (lastMet === "") {
      // never met — but only "overdue" once they've been around longer than the
      // cadence; a fresh joiner shouldn't flag (blank join_date → treat as old).
      const tenure = s.joinDate ? daysBetween(s.joinDate, input.today) : Number.MAX_SAFE_INTEGER;
      if (tenure > input.intervalDays) {
        meetingFlag = true;
        reasons.push("never met");
      }
    } else if (gapDays !== null && gapDays > input.intervalDays) {
      meetingFlag = true;
      reasons.push(`no meeting in ${gapDays}d`);
    }

    const pct = input.defaulterPctById.get(s.id);
    if (pct !== undefined) reasons.push(`${Math.round(pct * 100)}% attendance`);

    const streak = input.streakById.get(s.id);
    if (streak !== undefined) reasons.push(`absent ×${streak}`);

    const out = input.outstandingById.get(s.id);
    if (out !== undefined) reasons.push(`₹${out.toLocaleString("en-IN")} due`);

    const flags =
      (meetingFlag ? 1 : 0) +
      (pct !== undefined ? 1 : 0) +
      (streak !== undefined ? 1 : 0) +
      (out !== undefined ? 1 : 0);
    if (flags === 0) continue;
    due.push({ id: s.id, name: s.name, parentPhone: s.parentPhone, reasons, flags, lastMet, gapDays });
  }
  // worst first; full list (the hub paginates the render).
  return due.sort((a, b) => {
    const gapA = a.gapDays === null ? Number.MAX_SAFE_INTEGER : a.gapDays;
    const gapB = b.gapDays === null ? Number.MAX_SAFE_INTEGER : b.gapDays;
    return b.flags - a.flags || gapB - gapA || a.name.localeCompare(b.name);
  });
}

/** PTM hub data: upcoming (scheduled, soonest first — overdue floats up), recent
 *  history, and the risk-ranked "to meet" list. Attendance signals are reused
 *  from getOwnerStats; fees from the ledger. 8 reads, one-time per hub load
 *  (same tier as the owner dashboard) — not on any hot path. */
export async function getPtmBoard(): Promise<PtmBoard> {
  const [ptms, attendance, students, batches, teachers, cfg, charges, payments] =
    await Promise.all([
      safeReadTab<PtmRow>("PTM"),
      readTab<AttendanceRow>("Attendance"),
      readTab<Student>("Students"),
      readTab<Batch>("Batches"),
      readTab<Staff>("Staff"),
      config(),
      safeReadTab<FeeChargeRow>("FeeCharges"),
      safeReadTab<PaymentRow>("Payments"),
    ]);
  const today = todayFromCfg(cfg);
  const stats = await getOwnerStats({ attendance, students, batches, teachers, cfg });

  const nameById = new Map(students.map((s) => [s.student_id, s.name]));
  const phoneById = new Map(students.map((s) => [s.student_id, s.parent_phone]));
  const live = ptms.filter((p) => p.status !== "void");

  const upcoming: PtmUpcoming[] = live
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp))
    .map((p) => ({
      ptm_id: p.ptm_id,
      studentId: p.student_id,
      studentName: nameById.get(p.student_id) ?? p.student_id,
      parentPhone: phoneById.get(p.student_id) ?? "",
      date: p.date,
      mode: p.mode,
    }));

  const recent: PtmRecent[] = live
    .filter((p) => p.status === "done" || p.status === "no_show")
    .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100)
    .map((p) => ({
      ptm_id: p.ptm_id,
      studentId: p.student_id,
      studentName: nameById.get(p.student_id) ?? p.student_id,
      date: p.date,
      mode: p.mode,
      met_with: p.met_with,
      summary: p.summary,
      status: p.status,
    }));

  // last completed meeting per student
  const lastMetById = new Map<string, string>();
  for (const p of live) {
    if (p.status !== "done") continue;
    const cur = lastMetById.get(p.student_id);
    if (!cur || p.date > cur) lastMetById.set(p.student_id, p.date);
  }

  const defaulterPctById = new Map(stats.defaulters.map((d) => [d.id, d.pct]));
  const streakById = new Map(stats.followups.map((f) => [f.id, f.streak]));
  // ponytail: O(students·ledger) outstanding scan — fine at centre scale
  const outstandingById = new Map<string, number>();
  for (const s of students) {
    const out = studentOutstanding(
      charges.filter((c) => c.student_id === s.student_id),
      payments.filter((p) => p.student_id === s.student_id),
    );
    if (out > 0) outstandingById.set(s.student_id, out);
  }

  const due = rankPtmDue({
    students: students
      .filter((s) => s.status === "active")
      .map((s) => ({ id: s.student_id, name: s.name, parentPhone: s.parent_phone, joinDate: s.join_date })),
    lastMetById,
    defaulterPctById,
    streakById,
    outstandingById,
    scheduledStudentIds: new Set(upcoming.map((u) => u.studentId)),
    today,
    intervalDays: PTM_INTERVAL_DAYS,
  });

  return { upcoming, recent, due, intervalDays: PTM_INTERVAL_DAYS };
}

// ============================================================================
// Online tests (MCQ, mock) — Phase 3. Four append-only tabs: Tests, Questions,
// Attempts, Answers. Scoring is ALWAYS server-side. All reads degrade to empty
// via safeReadTab so a centre that never provisioned the tabs simply shows none.
// ============================================================================

const OPTION_KEYS: readonly OptionKey[] = ["A", "B", "C", "D"];
export function isOptionKey(s: string): s is OptionKey {
  return (OPTION_KEYS as readonly string[]).includes(s);
}

const optionText = (q: QuestionRow, k: OptionKey): string =>
  ({ A: q.opt_a, B: q.opt_b, C: q.opt_c, D: q.opt_d })[k];

/** Positional row for a QuestionRow (A..I). */
function questionRowArr(q: QuestionRow): string[] {
  return [q.question_id, q.test_id, q.text, q.opt_a, q.opt_b, q.opt_c, q.opt_d, q.correct, q.marks];
}

// ---- owner: list + build ----

export interface TestOwnerView {
  test_id: string;
  title: string;
  batch_id: string;
  batchName: string;
  published: boolean;
  questionCount: number;
  totalMarks: number;
  attemptCount: number;
  duration_min: string;
}

export async function listTestsOwner(): Promise<TestOwnerView[]> {
  const [tests, questions, attempts, batches] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Batch>("Batches"),
  ]);
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const qByTest = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    if (!qByTest.has(q.test_id)) qByTest.set(q.test_id, []);
    qByTest.get(q.test_id)!.push(q);
  }
  const aCount = new Map<string, number>();
  for (const a of attempts) aCount.set(a.test_id, (aCount.get(a.test_id) ?? 0) + 1);

  return tests
    .map((t) => {
      const qs = qByTest.get(t.test_id) ?? [];
      return {
        test_id: t.test_id,
        title: t.title,
        batch_id: t.batch_id,
        batchName: bName.get(t.batch_id) ?? t.batch_id,
        published: t.published === "TRUE",
        questionCount: qs.length,
        totalMarks: qs.reduce((s, q) => s + (Number(q.marks) || 0), 0),
        attemptCount: aCount.get(t.test_id) ?? 0,
        duration_min: t.duration_min,
      };
    })
    .sort((a, b) => b.test_id.localeCompare(a.test_id));
}

export async function getTest(id: string): Promise<TestRow | null> {
  const tests = await safeReadTab<TestRow>("Tests");
  return tests.find((t) => t.test_id === id) ?? null;
}

export interface TestBuild {
  test: TestRow;
  batchName: string;
  questions: QuestionRow[];
  totalMarks: number;
}

/** Owner test-detail data: the test + its questions (WITH correct answers). */
export async function getTestBuild(id: string): Promise<TestBuild | null> {
  const [tests, questions, batches] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    readTab<Batch>("Batches"),
  ]);
  const test = tests.find((t) => t.test_id === id);
  if (!test) return null;
  const qs = questions
    .filter((q) => q.test_id === id)
    .sort((a, b) => a.question_id.localeCompare(b.question_id));
  return {
    test,
    batchName: batches.find((b) => b.batch_id === test.batch_id)?.name ?? test.batch_id,
    questions: qs,
    totalMarks: qs.reduce((s, q) => s + (Number(q.marks) || 0), 0),
  };
}

export async function createTest(input: {
  title: string;
  batchId: string;
  passPct: number;
  negativeMarking: boolean;
  marksToCut: number;
  durationMin: number;
}): Promise<string> {
  const tests = await safeReadTab<TestRow>("Tests");
  const id = nextId(tests.map((t) => t.test_id), "TST", 4);
  await appendRows("Tests", [
    [
      id,
      input.title,
      input.batchId,
      String(input.passPct),
      input.negativeMarking ? "TRUE" : "FALSE",
      String(input.marksToCut),
      input.durationMin > 0 ? String(input.durationMin) : "",
      "FALSE", // unpublished until the owner publishes
      await effectiveToday(),
    ],
  ]);
  return id;
}

export async function addQuestion(input: {
  testId: string;
  text: string;
  options: [string, string, string, string]; // A,B,C,D
  correct: OptionKey;
  marks: number;
}): Promise<string> {
  const questions = await safeReadTab<QuestionRow>("Questions");
  const id = nextId(questions.map((q) => q.question_id), "QST", 4);
  await appendRows("Questions", [
    questionRowArr({
      question_id: id,
      test_id: input.testId,
      text: input.text,
      opt_a: input.options[0],
      opt_b: input.options[1],
      opt_c: input.options[2],
      opt_d: input.options[3],
      correct: input.correct,
      marks: String(input.marks),
    }),
  ]);
  return id;
}

/** Delete a question by id (fresh read → row number → deleteRows). Blocked once
 *  the test has attempts, so a graded test's questions can't shift under it. */
export async function deleteQuestion(questionId: string): Promise<void> {
  const questions = await safeReadTab<QuestionRow>("Questions");
  const idx = questions.findIndex((q) => q.question_id === questionId);
  if (idx < 0) return;
  const attempts = await safeReadTab<AttemptRow>("Attempts");
  if (attempts.some((a) => a.test_id === questions[idx].test_id)) return; // frozen once attempted
  await deleteRows("Questions", [idx + 2]);
}

/** Publish/unpublish. Publishing requires ≥1 question (guarded here). */
export async function setTestPublished(id: string, published: boolean): Promise<void> {
  const tests = await safeReadTab<TestRow>("Tests");
  const idx = tests.findIndex((t) => t.test_id === id);
  if (idx < 0) return;
  if (published) {
    const questions = await safeReadTab<QuestionRow>("Questions");
    if (!questions.some((q) => q.test_id === id)) return; // never publish an empty test
  }
  await updateValues(`Tests!H${idx + 2}`, [[published ? "TRUE" : "FALSE"]]);
}

// ---- shared: enrollment + scoring ----

function isEnrolledActive(enrolls: Enrollment[], studentId: string, batchId: string): boolean {
  return enrolls.some(
    (e) => e.student_id === studentId && e.batch_id === batchId && e.status === "active" && e.end_date === "",
  );
}

export interface ScoredQuestion {
  question_id: string;
  chosen: OptionKey | "";
  correctKey: OptionKey;
  isCorrect: boolean;
  marks: number;
  awarded: number; // +marks / 0 / −marksToCut
}

/** Pure server-side scoring. Correct → +marks. Wrong (a chosen option) → −cut
 *  when negative marking is on, else 0. Blank → 0. Total floored at 0. Exported
 *  for the throwaway self-check. */
export function scoreAttempt(
  test: Pick<TestRow, "negative_marking" | "marks_to_cut">,
  questions: QuestionRow[],
  chosenByQ: Map<string, string>,
): { score: number; max: number; perQuestion: ScoredQuestion[] } {
  const neg = test.negative_marking === "TRUE";
  const cut = Number(test.marks_to_cut) || 0;
  let score = 0;
  let max = 0;
  const perQuestion = questions.map((q) => {
    const marks = Number(q.marks) || 0;
    max += marks;
    const raw = (chosenByQ.get(q.question_id) ?? "").toUpperCase();
    const chosen: OptionKey | "" = isOptionKey(raw) ? raw : "";
    const correctKey = (isOptionKey(q.correct) ? q.correct : "A") as OptionKey;
    const isCorrect = chosen !== "" && chosen === correctKey;
    const awarded = isCorrect ? marks : chosen !== "" && neg ? -cut : 0;
    score += awarded;
    return { question_id: q.question_id, chosen, correctKey, isCorrect, marks, awarded };
  });
  return { score: Math.max(0, score), max, perQuestion };
}

// ---- student: list + take + submit + result ----

export interface StudentTestView {
  test_id: string;
  title: string;
  batchName: string;
  questionCount: number;
  totalMarks: number;
  duration_min: string;
  passPct: number;
  attempt: { score: number; max: number; passed: boolean } | null; // null = not taken
}

/** Published tests for the student's active batches, with their attempt (if any).
 *  Scoped to studentId — never lists another student's tests or scores. */
export async function getStudentTests(studentId: string): Promise<StudentTestView[]> {
  const [tests, questions, attempts, enrolls, batches] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Enrollment>("Enrollments"),
    readTab<Batch>("Batches"),
  ]);
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const myAttempt = new Map(attempts.filter((a) => a.student_id === studentId).map((a) => [a.test_id, a]));
  const qByTest = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    if (!qByTest.has(q.test_id)) qByTest.set(q.test_id, []);
    qByTest.get(q.test_id)!.push(q);
  }
  return tests
    .filter((t) => t.published === "TRUE" && isEnrolledActive(enrolls, studentId, t.batch_id))
    .map((t) => {
      const qs = qByTest.get(t.test_id) ?? [];
      const totalMarks = qs.reduce((s, q) => s + (Number(q.marks) || 0), 0);
      const passPct = Number(t.pass_pct) || 0;
      const a = myAttempt.get(t.test_id);
      return {
        test_id: t.test_id,
        title: t.title,
        batchName: bName.get(t.batch_id) ?? t.batch_id,
        questionCount: qs.length,
        totalMarks,
        duration_min: t.duration_min,
        passPct,
        attempt: a
          ? {
              score: Number(a.score) || 0,
              max: Number(a.max_score) || 0,
              passed: (Number(a.max_score) || 0) > 0 && (Number(a.score) || 0) / (Number(a.max_score) || 1) * 100 >= passPct,
            }
          : null,
      };
    })
    .sort((x, y) => Number(x.attempt != null) - Number(y.attempt != null) || y.test_id.localeCompare(x.test_id));
}

export type TakerQuestion = {
  question_id: string;
  text: string;
  options: { key: OptionKey; text: string }[];
  marks: number;
};

export type TakeTestResult =
  | { ok: true; test: TestRow; questions: TakerQuestion[] }
  | { ok: false; reason: "not-found" | "not-available" | "already-done" };

/** Prepare a test for taking — WITHOUT leaking correct answers to the client.
 *  Guards: exists, published, student enrolled in its batch, not already attempted. */
export async function getTestForTaking(testId: string, studentId: string): Promise<TakeTestResult> {
  const [tests, questions, attempts, enrolls] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const test = tests.find((t) => t.test_id === testId);
  if (!test) return { ok: false, reason: "not-found" };
  if (test.published !== "TRUE" || !isEnrolledActive(enrolls, studentId, test.batch_id))
    return { ok: false, reason: "not-available" };
  if (attempts.some((a) => a.test_id === testId && a.student_id === studentId))
    return { ok: false, reason: "already-done" };
  const qs = questions
    .filter((q) => q.test_id === testId)
    .sort((a, b) => a.question_id.localeCompare(b.question_id))
    .map((q) => ({
      question_id: q.question_id,
      text: q.text,
      marks: Number(q.marks) || 0,
      options: OPTION_KEYS.map((k) => ({ key: k, text: optionText(q, k) })).filter((o) => o.text !== ""),
    }));
  return { ok: true, test, questions: qs };
}

/** Score + persist an attempt. Re-runs every guard server-side (trust boundary):
 *  published, enrolled, not-already-done. Appends the Attempt + one Answer per
 *  question. Returns the attempt id, or an error reason (no partial writes). */
export async function submitAttempt(input: {
  testId: string;
  studentId: string;
  chosen: Record<string, string>; // question_id -> "A".."D" | ""
}): Promise<{ ok: true; attemptId: string } | { ok: false; reason: "not-available" | "already-done" | "not-found" }> {
  const [tests, questions, attempts, enrolls] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Enrollment>("Enrollments"),
  ]);
  const test = tests.find((t) => t.test_id === input.testId);
  if (!test) return { ok: false, reason: "not-found" };
  if (test.published !== "TRUE" || !isEnrolledActive(enrolls, input.studentId, test.batch_id))
    return { ok: false, reason: "not-available" };
  if (attempts.some((a) => a.test_id === input.testId && a.student_id === input.studentId))
    return { ok: false, reason: "already-done" };

  const qs = questions.filter((q) => q.test_id === input.testId);
  const chosenByQ = new Map(Object.entries(input.chosen));
  const { score, max, perQuestion } = scoreAttempt(test, qs, chosenByQ);

  const attemptId = nextId(attempts.map((a) => a.attempt_id), "ATT", 4);
  await appendRows("Attempts", [
    [attemptId, input.testId, input.studentId, String(score), String(max), centerTimestamp()],
  ]);
  await appendRows(
    "Answers",
    perQuestion.map((p) => [attemptId, p.question_id, p.chosen, p.isCorrect ? "TRUE" : "FALSE"]),
  );
  return { ok: true, attemptId };
}

export interface AttemptResult {
  test: TestRow;
  score: number;
  max: number;
  passed: boolean;
  passPct: number;
  questions: {
    text: string;
    options: { key: OptionKey; text: string }[];
    chosen: OptionKey | "";
    correctKey: OptionKey;
    isCorrect: boolean;
    marks: number;
  }[];
}

/** A student's result for a test (their attempt only — scoped to studentId).
 *  Null when they haven't attempted it. Shows the correct answer per question. */
export async function getAttemptResult(testId: string, studentId: string): Promise<AttemptResult | null> {
  const [tests, questions, attempts, answers] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    safeReadTab<AnswerRow>("Answers"),
  ]);
  const test = tests.find((t) => t.test_id === testId);
  if (!test) return null;
  const attempt = attempts.find((a) => a.test_id === testId && a.student_id === studentId);
  if (!attempt) return null;
  const chosenByQ = new Map(
    answers.filter((a) => a.attempt_id === attempt.attempt_id).map((a) => [a.question_id, a.chosen]),
  );
  const qs = questions
    .filter((q) => q.test_id === testId)
    .sort((a, b) => a.question_id.localeCompare(b.question_id));
  const score = Number(attempt.score) || 0;
  const max = Number(attempt.max_score) || 0;
  const passPct = Number(test.pass_pct) || 0;
  return {
    test,
    score,
    max,
    passPct,
    passed: max > 0 && (score / max) * 100 >= passPct,
    questions: qs.map((q) => {
      const raw = (chosenByQ.get(q.question_id) ?? "").toUpperCase();
      const chosen: OptionKey | "" = isOptionKey(raw) ? raw : "";
      const correctKey = (isOptionKey(q.correct) ? q.correct : "A") as OptionKey;
      return {
        text: q.text,
        marks: Number(q.marks) || 0,
        chosen,
        correctKey,
        isCorrect: chosen !== "" && chosen === correctKey,
        options: OPTION_KEYS.map((k) => ({ key: k, text: optionText(q, k) })).filter((o) => o.text !== ""),
      };
    }),
  };
}

export interface TestResultsOwner {
  test: TestRow;
  batchName: string;
  max: number;
  rosterSize: number;
  attempted: number;
  average: number | null; // mean score over attempts, null when none
  passed: number;
  rows: { studentId: string; name: string; score: number; passed: boolean; taken: boolean }[];
}

/** Owner results for a test: every roster student, their score (or "not taken"),
 *  plus class average + pass count. Feeds the owner test detail + dashboard. */
export async function getTestResultsOwner(testId: string): Promise<TestResultsOwner | null> {
  const [tests, attempts, enrolls, students, batches] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Enrollment>("Enrollments"),
    readTab<Student>("Students"),
    readTab<Batch>("Batches"),
  ]);
  const test = tests.find((t) => t.test_id === testId);
  if (!test) return null;
  const sName = new Map(students.map((s) => [s.student_id, s.name]));
  const passPct = Number(test.pass_pct) || 0;
  const roster = [
    ...new Set(
      enrolls
        .filter((e) => e.batch_id === test.batch_id && e.status === "active" && e.end_date === "")
        .map((e) => e.student_id),
    ),
  ];
  const byStudent = new Map(attempts.filter((a) => a.test_id === testId).map((a) => [a.student_id, a]));
  const rows = roster
    .map((sid) => {
      const a = byStudent.get(sid);
      const score = a ? Number(a.score) || 0 : 0;
      const max = a ? Number(a.max_score) || 0 : 0;
      return {
        studentId: sid,
        name: sName.get(sid) ?? sid,
        score,
        taken: !!a,
        passed: !!a && max > 0 && (score / max) * 100 >= passPct,
      };
    })
    .sort((x, y) => Number(y.taken) - Number(x.taken) || y.score - x.score || x.name.localeCompare(y.name));
  const taken = rows.filter((r) => r.taken);
  const max = taken.length ? Number(byStudent.get(taken[0].studentId)!.max_score) || 0 : 0;
  return {
    test,
    batchName: batches.find((b) => b.batch_id === test.batch_id)?.name ?? test.batch_id,
    max,
    rosterSize: roster.length,
    attempted: taken.length,
    average: taken.length ? Math.round((taken.reduce((s, r) => s + r.score, 0) / taken.length) * 10) / 10 : null,
    passed: taken.filter((r) => r.passed).length,
    rows,
  };
}

export interface TestsDashboard {
  publishedCount: number;
  recent: { test_id: string; title: string; batchName: string; attempted: number; average: number | null; max: number }[];
}

/** Compact tests summary for the owner dashboard: published count + the latest
 *  few tests with attempt count and class average. */
export async function getTestsDashboard(): Promise<TestsDashboard> {
  const [tests, questions, attempts, batches] = await Promise.all([
    safeReadTab<TestRow>("Tests"),
    safeReadTab<QuestionRow>("Questions"),
    safeReadTab<AttemptRow>("Attempts"),
    readTab<Batch>("Batches"),
  ]);
  const bName = new Map(batches.map((b) => [b.batch_id, b.name]));
  const maxByTest = new Map<string, number>();
  for (const q of questions)
    maxByTest.set(q.test_id, (maxByTest.get(q.test_id) ?? 0) + (Number(q.marks) || 0));
  const attByTest = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    if (!attByTest.has(a.test_id)) attByTest.set(a.test_id, []);
    attByTest.get(a.test_id)!.push(a);
  }
  const recent = tests
    .filter((t) => t.published === "TRUE")
    .sort((a, b) => b.test_id.localeCompare(a.test_id))
    .slice(0, 5)
    .map((t) => {
      const as = attByTest.get(t.test_id) ?? [];
      return {
        test_id: t.test_id,
        title: t.title,
        batchName: bName.get(t.batch_id) ?? t.batch_id,
        attempted: as.length,
        max: maxByTest.get(t.test_id) ?? 0,
        average: as.length ? Math.round((as.reduce((s, a) => s + (Number(a.score) || 0), 0) / as.length) * 10) / 10 : null,
      };
    });
  return { publishedCount: tests.filter((t) => t.published === "TRUE").length, recent };
}
