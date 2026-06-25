// Row shapes for the 10 Sheet tabs (PLAN.md §6). All values are strings as
// they come from the Sheet; parse at the edges where needed.

export type AttendanceStatus = "present" | "absent" | "late";

/** Kinds accepted by the /api/export route (shared by the export buttons). */
export type ExportKind = "attendance" | "defaulters" | "batches" | "student";

export interface Teacher {
  teacher_id: string;
  name: string;
  phone: string;
  pin_hash: string;
  role: "teacher" | "owner";
  subjects: string;
  active: string; // "TRUE" | "FALSE"
}

export interface Student {
  student_id: string;
  name: string;
  phone: string;
  parent_phone: string;
  join_date: string;
  status: string; // "active" | "inactive"
  notes: string;
}

export interface Batch {
  batch_id: string;
  name: string;
  subject: string;
  teacher_id: string;
  room_id: string;
  fee: string;
  level: string;
  active: string;
}

export interface Enrollment {
  enroll_id: string;
  student_id: string;
  batch_id: string;
  start_date: string;
  end_date: string;
  status: string; // "active" | "left" | "inactive"
}

export interface Room {
  room_id: string;
  name: string;
  capacity: string;
}

export interface TimetableRule {
  slot_id: string;
  batch_id: string;
  day_of_week: string; // one or more of Mon..Sun, comma-joined
  start: string;
  end: string;
  room_id: string;
  teacher_id: string;
  effective_from: string;
  effective_to: string; // empty = open-ended
}

export interface Session {
  session_id: string;
  date: string;
  batch_id: string;
  start: string;
  end: string;
  room_id: string;
  teacher_id: string;
  status: string; // scheduled | cancelled | extra
  source: string; // recurring | adhoc
  slot_id: string; // originating Timetable rule (empty for adhoc)
}

export interface AttendanceRow {
  log_id: string;
  session_id: string;
  date: string;
  batch_id: string;
  student_id: string;
  status: AttendanceStatus;
  marked_by: string;
  method: string; // app | manual
  timestamp: string;
  reason: string;
}

export const ATTENDANCE_HEADER = [
  "log_id",
  "session_id",
  "date",
  "batch_id",
  "student_id",
  "status",
  "marked_by",
  "method",
  "timestamp",
  "reason",
] as const;
