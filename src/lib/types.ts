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


/** A person on staff — teaching or non-teaching. The single people table
 *  (Sheet tab "Staff", formerly "Teachers"). The PK column is historically
 *  `teacher_id`; FK columns in Batches/Sessions/Timetable/Attendance/PTM all
 *  reference it by that same name, so it keeps the name on disk. Columns A..M
 *  (positional for writes). Two independent discriminators:
 *    - staff_type: who can be assigned to teach / appears in teacher pickers
 *    - role:       app login access (non-teaching staff have role "" = no login) */
export interface Staff {
  teacher_id: string;     // A  PK — T### teaching, S### non-teaching
  name: string;           // B
  phone: string;          // C  login key for staff who sign in ("" allowed for non-teaching)
  pin_hash: string;       // D  bcrypt; "" / "<placeholder>" = no login
  role: string;           // E  "" | "teacher" | "owner"
  subjects: string;       // F  teaching staff only
  active: string;         // G  "TRUE" | "FALSE"
  staff_type: string;     // H  "teaching" | "non_teaching" ("" = teaching, legacy rows)
  designation: string;    // I  e.g. Receptionist, Accountant, Counselor (non-teaching)
  department: string;     // J  e.g. Front Office, Accounts, Facilities
  join_date: string;      // K  YYYY-MM-DD
  monthly_salary: string; // L  base monthly salary (₹), "" if unset — used by payroll (Phase 4)
  notes: string;          // M
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
  start_date: string; // YYYY-MM-DD, "" = open. Sheet col I (added via provision-batch-dates)
  expected_end_date: string; // YYYY-MM-DD, "" = open-ended (no generation cap). Sheet col J
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

// ===== PTM (parent–teacher meetings) =====

export type PtmMode = "in_person" | "call" | "video";
export type PtmStatus = "scheduled" | "done" | "no_show" | "cancelled" | "void";

/** One parent–teacher meeting — scheduled, then completed in place (or logged
 *  directly as done). Append-only ledger like Fees. Columns A..I (positional). */
export interface PtmRow {
  ptm_id: string;     // A  PTM0001
  student_id: string; // B
  date: string;       // C  YYYY-MM-DD (scheduled or meeting date)
  mode: string;       // D  in_person | call | video
  met_with: string;   // E  Mother | Father | Guardian | Both | Other ("" while scheduled)
  teacher_id: string; // F  who meets/met (the acting owner)
  summary: string;    // G  discussion + action notes (free text)
  status: string;     // H  scheduled | done | no_show | cancelled | void
  timestamp: string;  // I  centerTimestamp() at create (audit)
}

// ===== Staff attendance (daily register, append-only) =====

export type StaffAttendanceStatus = "present" | "absent" | "leave" | "half_day";

/** One staff member's attendance for one day. Upsert key = (staff_id, date) —
 *  re-marking a day updates that row in place. Columns A..G (positional). */
export interface StaffAttendanceRow {
  log_id: string;     // A  SAT0001
  staff_id: string;   // B  Staff.teacher_id (T### or S###)
  date: string;       // C  YYYY-MM-DD
  status: string;     // D  present | absent | leave | half_day
  marked_by: string;  // E  owner teacher_id
  timestamp: string;  // F  centerTimestamp() (audit)
  note: string;       // G  optional (e.g. leave reason)
}

// ===== Staff tasks / duties =====

export type StaffTaskStatus = "open" | "done" | "cancelled";

/** A duty/task assigned to a staffer. Status is updated in place. Cols A..I. */
export interface StaffTaskRow {
  task_id: string;    // A  TSK0001
  staff_id: string;   // B  assignee (Staff.teacher_id)
  title: string;      // C
  detail: string;     // D  optional
  due_date: string;   // E  YYYY-MM-DD or ""
  status: string;     // F  open | done | cancelled
  created: string;    // G  YYYY-MM-DD
  done_date: string;  // H  YYYY-MM-DD when done, else ""
  created_by: string; // I  owner teacher_id
}

