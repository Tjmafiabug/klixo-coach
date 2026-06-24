import "server-only";
import { readTab, appendRows } from "@/lib/sheets";
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

/** Today's sessions for a teacher (incl. sessions they substitute), enriched with roster + marked state. */
export async function getTodaySessions(teacherId: string): Promise<TodaySession[]> {
  const today = await effectiveToday();
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
    rosterByBatch.set(e.batch_id, (rosterByBatch.get(e.batch_id) ?? 0) + 1);
  }

  return sessions
    .filter(
      (s) =>
        s.date === today &&
        s.teacher_id === teacherId &&
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
  status: AttendanceStatus;
}

/** Active roster for a batch, prefilled with the latest mark for this session (default present). */
export async function getRoster(
  batchId: string,
  sessionId: string,
): Promise<{ roster: RosterEntry[]; alreadyMarked: boolean }> {
  const [enrolls, students, attendance] = await Promise.all([
    readTab<Enrollment>("Enrollments"),
    readTab<Student>("Students"),
    readTab<AttendanceRow>("Attendance"),
  ]);
  const studentById = new Map(students.map((s) => [s.student_id, s]));
  const ids = enrolls
    .filter((e) => e.batch_id === batchId && e.status === "active")
    .map((e) => e.student_id);

  const latest = latestPerStudent(attendance, sessionId);
  const roster = ids
    .map((id) => studentById.get(id))
    .filter((s): s is Student => !!s && s.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      student_id: s.student_id,
      name: s.name,
      status: (latest.get(s.student_id)?.status ?? "present") as AttendanceStatus,
    }));
  return { roster, alreadyMarked: roster.some((r) => latest.has(r.student_id)) };
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
 * Append attendance marks for a session. NOTE (MVP): re-marking appends new
 * rows; reads take the latest per (session, student). Today's seeded sessions
 * are unmarked, so first submit is clean. Harden to in-place update later.
 */
export async function submitAttendance(params: {
  sessionId: string;
  batchId: string;
  date: string;
  markedBy: string;
  marks: { studentId: string; status: AttendanceStatus; reason?: string }[];
}): Promise<number> {
  const attendance = await readTab<AttendanceRow>("Attendance");
  let max = 0;
  for (const a of attendance) {
    const n = parseInt(a.log_id.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  const ts = centerTimestamp();
  const rows = params.marks.map((m, i) => [
    `A${String(max + 1 + i).padStart(4, "0")}`,
    params.sessionId,
    params.date,
    params.batchId,
    m.studentId,
    m.status,
    params.markedBy,
    "app",
    ts,
    m.reason ?? "",
  ]);
  await appendRows("Attendance", rows);
  return rows.length;
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
