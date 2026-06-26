// Row shapes for the 10 Sheet tabs (PLAN.md §6). All values are strings as
// they come from the Sheet; parse at the edges where needed.

export type AttendanceStatus = "present" | "absent" | "late";

/** Kinds accepted by the /api/export route (shared by the export buttons). */
export type ExportKind = "attendance" | "defaulters" | "batches" | "student" | "fees";

// ===== Fees =====

export type ChargeKind = "monthly" | "admission" | "exam" | "other" | "discount";
export type FeeMethod = "cash" | "upi" | "card" | "bank" | "cheque" | "other";

/** One fee charge against a student. Columns A..I (positional). */
export interface FeeChargeRow {
  charge_id: string;  // FC0001
  student_id: string;
  batch_id: string;   // "" for one-off charges (admission/exam/other)
  period: string;     // YYYY-MM for monthly; "" for one-time
  kind: ChargeKind;
  amount: string;     // signed int string; charges>0; discount<0
  note: string;
  status: string;     // "active" | "void"
  created: string;    // YYYY-MM-DD = effectiveToday() at write
}

/** One payment from a student. Columns A..H (positional). */
export interface PaymentRow {
  payment_id: string; // PMT0001
  student_id: string;
  amount: string;     // positive int string
  date: string;       // YYYY-MM-DD (payment date, cash-basis)
  method: FeeMethod;
  note: string;
  timestamp: string;  // centerTimestamp() (audit)
  status: string;     // "active" | "void"
}

export const FEE_CHARGES_HEADER = [
  "charge_id",
  "student_id",
  "batch_id",
  "period",
  "kind",
  "amount",
  "note",
  "status",
  "created",
] as const;

export const PAYMENTS_HEADER = [
  "payment_id",
  "student_id",
  "amount",
  "date",
  "method",
  "note",
  "timestamp",
  "status",
] as const;

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

/** A syllabus, one per subject + level (e.g. "Class 10 Mathematics"). Batches
 *  resolve to a course by matching their subject + level. */
export interface Course {
  course_id: string;
  subject: string;
  level: string; // e.g. "Class 10" — mirrors Batch.level
  name: string;
  description: string;
  active: string; // "TRUE" | "FALSE"
}

/** An ordered chapter within a course; `topics` is a free-text list of
 *  sub-topics, `resource_url` an optional NCERT/video link. */
export interface Chapter {
  chapter_id: string;
  course_id: string;
  order: string; // numeric string, 1-based
  title: string;
  topics: string;
  resource_url: string;
}

/** Per-batch teaching progress for a single chapter (P3). One row per touched
 *  (batch, chapter); an absent row reads as "pending". `done_date` is set only
 *  while status is "done". */
export interface BatchProgressRow {
  batch_id: string;
  chapter_id: string;
  status: string; // "done" | "in_progress" | "pending"
  done_date: string; // YYYY-MM-DD when done, else ""
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
