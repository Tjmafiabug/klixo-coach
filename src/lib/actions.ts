"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  getTeacherByPhone,
  getSessionMeta,
  getRoster,
  submitAttendance,
  effectiveToday,
  cancelSession as cancelSessionData,
  setSubstitute,
  createExtraClass,
  generateSessions,
  clashesForCandidate,
  createRule,
  updateRule,
  expireRule,
  ruleClashes,
  // Milestone C — owner data management
  createRoom,
  updateRoom,
  deleteRoom,
  roomUsage,
  createHoliday,
  deleteHoliday,
  getStaff,
  createStaff,
  updateStaff,
  setStaffPin,
  setStaffActive,
  staffPhoneTaken,
  otherActiveOwners,
  submitStaffAttendance,
  isStaffAttendanceStatus,
  createStaffTask,
  setStaffTaskStatus,
  isStaffTaskStatus,
  recordSalaryPayment,
  addSalaryAdjustment,
  voidSalaryPayment,
  voidSalaryAdjustment,
  createStudent,
  updateStudent,
  setStudentActive,
  createBatch,
  updateBatch,
  setBatchActive,
  createEnrollment,
  endEnrollment,
  enrollmentExists,
  enrollmentClash,
  getEnrollment,
  updateCenterConfig,
  refsExist,
  // P2 — curriculum CRUD
  createCourse,
  updateCourse,
  setCourseActive,
  createChapter,
  updateChapter,
  deleteChapter,
  moveChapter,
  // P3 — curriculum progress
  setChapterProgress,
  isProgressStatus,
  // Fees module
  generateMonthlyCharges,
  addCharge,
  voidCharge,
  recordPayment,
  voidPayment,
  currentNetOutstanding,
  currentPeriod,
  isChargeKind,
  isFeeMethod,
  // PTM module
  appendPtm,
  completePtm,
  setPtmStatus,
  isPtmMode,
  isPtmStatus,
} from "@/lib/data";
import type { StaffInput } from "@/lib/data";
import { createSession, destroySession, getSession } from "@/lib/auth";
import { lockRemainingMs, recordFailure, recordSuccess } from "@/lib/rate-limit";
import type { AttendanceStatus, PtmMode, PtmStatus, StaffAttendanceStatus } from "@/lib/types";

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["present", "absent", "late"];

export interface LoginState {
  error?: string;
}

function safeParse<T>(v: FormDataEntryValue | null, fallback: T): T {
  try {
    return JSON.parse(String(v ?? "")) as T;
  } catch {
    return fallback;
  }
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!phone || !pin) return { error: "Enter phone and PIN." };

  // N9 lockout: stop online PIN guessing after repeated failures on this phone.
  const lockMs = lockRemainingMs(phone);
  if (lockMs > 0) {
    return { error: `Too many attempts. Try again in ${Math.ceil(lockMs / 60000)} min.` };
  }

  const teacher = await getTeacherByPhone(phone);
  if (!teacher || !teacher.pin_hash || teacher.pin_hash.startsWith("<")) {
    recordFailure(phone);
    return { error: "Invalid phone or PIN." };
  }
  const ok = await bcrypt.compare(pin, teacher.pin_hash);
  if (!ok) {
    recordFailure(phone);
    return { error: "Invalid phone or PIN." };
  }

  recordSuccess(phone);
  const role = teacher.role === "owner" ? "owner" : "teacher";
  await createSession({
    teacherId: teacher.teacher_id,
    role,
    name: teacher.name,
  });
  redirect(role === "owner" ? "/dashboard" : "/today");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function submitMarks(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");

  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await getSessionMeta(sessionId);
  if (!session) redirect("/today");

  // a teacher may only mark their own (incl. substituted) sessions; owner marks all
  if (user.role !== "owner" && session.teacher_id !== user.teacherId) {
    redirect("/today");
  }

  // can't mark cancelled or future sessions
  const today = await effectiveToday();
  if (session.status === "cancelled" || session.date > today) {
    redirect("/today");
  }
  const isPast = session.date < today;

  const submitted = safeParse<{ studentId: string; status: AttendanceStatus }[]>(
    formData.get("marks"),
    [],
  );
  const reasons = safeParse<Record<string, string>>(formData.get("reasons"), {});
  if (!Array.isArray(submitted)) redirect(`/mark/${sessionId}`);
  const backfillReason = String(formData.get("backfillReason") ?? "").trim();

  // saved status per student (server-authoritative — don't trust the client)
  const { roster } = await getRoster(session.batch_id, sessionId, session.date);
  const savedByStudent = new Map(roster.map((r) => [r.student_id, r.saved]));

  const writes: {
    studentId: string;
    status: AttendanceStatus;
    method: "app" | "manual";
    reason: string;
  }[] = [];
  for (const m of submitted) {
    if (!savedByStudent.has(m.studentId)) continue; // not on roster — ignore
    if (!ATTENDANCE_STATUSES.includes(m.status)) continue; // invalid status — ignore (N4)
    const saved = savedByStudent.get(m.studentId) ?? null;
    if (saved === null) {
      // never marked → backfill (past) is a manual mark with a reason (the client
      // requires one); if it's empty it's the rare midnight-rollover case where the
      // page rendered as "today" — fall back rather than bounce the teacher.
      if (isPast) {
        writes.push({
          studentId: m.studentId,
          status: m.status,
          method: "manual",
          reason: backfillReason || "Marked just after the session",
        });
      } else {
        writes.push({ studentId: m.studentId, status: m.status, method: "app", reason: "" });
      }
    } else if (m.status !== saved) {
      // correction → manual + per-student reason
      const r = (reasons[m.studentId] ?? "").trim();
      if (!r) redirect(`/mark/${sessionId}?error=reason`);
      writes.push({ studentId: m.studentId, status: m.status, method: "manual", reason: r });
    }
    // unchanged existing mark → no write
  }

  if (writes.length === 0) redirect("/today?nochange=1");

  await submitAttendance({
    sessionId: session.session_id,
    batchId: session.batch_id,
    date: session.date,
    markedBy: user.teacherId,
    marks: writes,
  });
  redirect(`/today?marked=${encodeURIComponent(session.batch_id)}`);
}

export async function cancelSession(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await getSessionMeta(sessionId);
  if (!session) redirect("/today");
  // only the owner or the session's own (incl. substitute) teacher may cancel,
  // and only an upcoming, not-already-cancelled session
  const today = await effectiveToday();
  const owns = user.role === "owner" || session.teacher_id === user.teacherId;
  if (!owns || session.status === "cancelled" || session.date < today) {
    redirect("/today");
  }
  await cancelSessionData(sessionId);
  redirect("/today?cancelled=1");
}

export async function substituteTeacher(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sessionId = String(formData.get("sessionId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");
  // the substitute must be a real, active teacher (else the session becomes
  // unmarkable — a deactivated/unknown teacher can't sign in to mark it)
  if (sessionId && teacherId && (await refsExist({ teacherId }))) {
    await setSubstitute(sessionId, teacherId);
  }
  redirect(`/mark/${sessionId}`);
}

export async function runGeneration(): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { added, removed } = await generateSessions();
  redirect(`/today?generated=${added}&removed=${removed}`);
}

export async function saveRule(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const slotId = String(formData.get("slotId") ?? "").trim();
  const days = formData.getAll("days").map((d) => String(d));
  const rule = {
    slot_id: slotId || undefined,
    batch_id: String(formData.get("batchId") ?? "").trim(),
    day_of_week: days.join(","),
    start: String(formData.get("start") ?? "").trim(),
    end: String(formData.get("end") ?? "").trim(),
    room_id: String(formData.get("roomId") ?? "").trim(),
    teacher_id: String(formData.get("teacherId") ?? "").trim(),
    effective_from: String(formData.get("effectiveFrom") ?? "").trim(),
    effective_to: String(formData.get("effectiveTo") ?? "").trim(),
  };
  const back = slotId ? `/timetable/${slotId}` : "/timetable/new";
  if (
    !rule.batch_id || days.length === 0 || !rule.start || !rule.end ||
    !rule.room_id || !rule.teacher_id || !rule.effective_from
  ) {
    redirect(`${back}?error=missing`);
  }
  if (rule.start >= rule.end) redirect(`${back}?error=time`);
  if (rule.effective_to && rule.effective_to < rule.effective_from) {
    redirect(`${back}?error=range`);
  }
  // N7: referenced batch/room/teacher must exist (and be active)
  if (!(await refsExist({ batchId: rule.batch_id, roomId: rule.room_id, teacherId: rule.teacher_id }))) {
    redirect(`${back}?error=missing`);
  }

  const clash = await ruleClashes(rule);
  if (clash.blocking.length) {
    redirect(`${back}?error=clash&with=${clash.blocking.join(",")}`);
  }
  if (slotId) await updateRule(slotId, rule);
  else await createRule(rule);
  redirect(`/timetable?saved=1${clash.warnings.length ? "&warn=student" : ""}`);
}

export async function expireRuleAction(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const slotId = String(formData.get("slotId") ?? "").trim();
  const effectiveTo = String(formData.get("effectiveTo") ?? "").trim();
  if (slotId && effectiveTo) await expireRule(slotId, effectiveTo);
  redirect("/timetable?expired=1");
}

export async function addExtraClass(formData: FormData): Promise<void> {
  await requireOwner(); // scheduling is owner-only (matches generation/timetable)

  const date = String(formData.get("date") ?? "").trim();
  const batchId = String(formData.get("batchId") ?? "").trim();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  // Where to land after a successful add — only an internal /timetable path is
  // honoured (came from the calendar); anything else falls back to /today.
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  if (!date || !batchId || !start || !end || !roomId || !teacherId) {
    redirect("/new-session?error=missing");
  }
  if (start >= end) redirect("/new-session?error=time");
  if (date < (await effectiveToday())) redirect("/new-session?error=past"); // no back-dating
  if (!(await refsExist({ batchId, roomId, teacherId }))) redirect("/new-session?error=missing"); // N7
  // room/teacher clash blocks; student clash is a warning (allowed)
  const clash = await clashesForCandidate({ date, batchId, start, end, roomId, teacherId });
  if (clash.blocking.length) {
    redirect(`/new-session?error=clash&with=${clash.blocking.join(",")}`);
  }
  await createExtraClass({ date, batchId, start, end, roomId, teacherId });
  if (returnTo.startsWith("/timetable")) redirect(returnTo);
  redirect(`/today?added=1${clash.warnings.length ? "&warn=student" : ""}`);
}

// ============================================================================
// Milestone C — owner data management actions
// Every action re-checks the owner role server-side (N2: never trust the UI).
// ============================================================================

async function requireOwner() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  return user;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isPhone = (s: string) => /^\d{6,15}$/.test(s);
const isPin = (s: string) => /^\d{4,6}$/.test(s);
const isInt = (s: string) => /^\d+$/.test(s);

/** Only allow redirecting back to an internal /manage path (no open redirect). */
function safeBack(v: FormDataEntryValue | null, fallback: string): string {
  const s = String(v ?? "");
  return s.startsWith("/manage/") ? s : fallback;
}

// ---------------- C5 Rooms ----------------

export async function saveRoom(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("roomId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const capacity = String(formData.get("capacity") ?? "").trim();
  const back = id ? `/manage/rooms/${id}` : "/manage/rooms";
  if (!name || !isInt(capacity)) redirect(`${back}?error=missing`);
  if (id) await updateRoom(id, { name, capacity });
  else await createRoom({ name, capacity });
  redirect("/manage/rooms?saved=1");
}

export async function deleteRoomAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("roomId") ?? "").trim();
  if (!id) redirect("/manage/rooms");
  if ((await roomUsage(id)) > 0) redirect(`/manage/rooms/${id}?error=inuse`);
  await deleteRoom(id);
  redirect("/manage/rooms?deleted=1");
}

// ---------------- C6 Holidays ----------------

export async function saveHoliday(formData: FormData): Promise<void> {
  await requireOwner();
  const date = String(formData.get("date") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!isDate(date) || !name) redirect("/manage/holidays?error=missing");
  await createHoliday({ date, name }); // idempotent on date; regenerates sessions
  redirect("/manage/holidays?saved=1");
}

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  await requireOwner();
  const date = String(formData.get("date") ?? "").trim();
  if (date) await deleteHoliday(date);
  redirect("/manage/holidays?deleted=1");
}

// ---------------- C4 Staff (teaching + non-teaching) ----------------

export async function saveStaff(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const staff_type =
    String(formData.get("staff_type") ?? "teaching") === "non_teaching"
      ? "non_teaching"
      : "teaching";
  const teaching = staff_type === "teaching";
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  // role/subjects apply to teaching staff only; non-teaching never log in
  const role = teaching
    ? String(formData.get("role") ?? "teacher") === "owner"
      ? "owner"
      : "teacher"
    : "";
  const join_date = String(formData.get("join_date") ?? "").trim();
  // salary is whole rupees — strip separators/junk so "20,000" stores as "20000"
  const monthly_salary = String(formData.get("monthly_salary") ?? "").replace(/[^\d]/g, "");
  const notes = String(formData.get("notes") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const back = id ? `/manage/staff/${id}` : `/manage/staff/new?type=${staff_type}`;

  // teaching staff log in → phone required & valid. non-teaching: phone optional,
  // but if given it must be a valid number (and still unique).
  if (!name) redirect(`${back}?error=missing`);
  if (teaching && !isPhone(phone)) redirect(`${back}?error=missing`);
  if (phone && !isPhone(phone)) redirect(`${back}?error=missing`);
  if (await staffPhoneTaken(phone, id || undefined)) redirect(`${back}?error=phone`);

  // Preserve the inactive type's columns on edit so an unrelated save never wipes
  // data the type-specific form doesn't render (teaching keeps any stored
  // designation/department; non-teaching keeps subjects).
  const cur = id ? await getStaff(id) : null;
  const subjects = teaching ? String(formData.get("subjects") ?? "").trim() : cur?.subjects ?? "";
  const designation = !teaching
    ? String(formData.get("designation") ?? "").trim()
    : cur?.designation ?? "";
  const department = !teaching
    ? String(formData.get("department") ?? "").trim()
    : cur?.department ?? "";

  const input: StaffInput = {
    name,
    phone,
    staff_type,
    role,
    subjects,
    designation,
    department,
    join_date,
    monthly_salary,
    notes,
  };

  if (id) {
    // demoting/retyping the last active owner would lock the centre out
    if (cur?.role === "owner" && role !== "owner" && (await otherActiveOwners(id)) === 0) {
      redirect(`${back}?error=lastowner`);
    }
    await updateStaff(id, input);
  } else {
    if (teaching && !isPin(pin)) redirect(`${back}?error=pin`);
    const pinHash = teaching ? bcrypt.hashSync(pin, 10) : "";
    await createStaff({ ...input, pinHash });
  }
  redirect("/manage/staff?saved=1");
}

export async function resetStaffPin(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!id) redirect("/manage/staff");
  if (!isPin(pin)) redirect(`/manage/staff/${id}?error=pin`);
  await setStaffPin(id, bcrypt.hashSync(pin, 10));
  redirect(`/manage/staff/${id}?pinset=1`);
}

export async function toggleStaffActive(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect("/manage/staff");
  if (!active) {
    const cur = await getStaff(id);
    if (cur?.role === "owner" && (await otherActiveOwners(id)) === 0) {
      redirect(`/manage/staff/${id}?error=lastowner`);
    }
  }
  await setStaffActive(id, active);
  redirect("/manage/staff?saved=1");
}

export async function saveStaffAttendance(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/manage/staff/attendance");
  const raw = safeParse<{ staffId: string; status: string }[]>(formData.get("marks"), []);
  // "" = clear that day's mark (blanks the row); any valid status sets it
  const marks = raw
    .filter((m) => m && m.staffId && (m.status === "" || isStaffAttendanceStatus(m.status)))
    .map((m) => ({ staffId: m.staffId, status: m.status as StaffAttendanceStatus | "" }));
  if (marks.length) await submitStaffAttendance({ date, markedBy: user.teacherId, marks });
  redirect(`/manage/staff/attendance?date=${date}&saved=1`);
}

export async function addStaffTask(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const staffId = String(formData.get("staffId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  const dueRaw = String(formData.get("due_date") ?? "").trim();
  if (!staffId || !title) redirect("/manage/staff/tasks?error=missing");
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : "";
  await createStaffTask({ staffId, title, detail, dueDate, createdBy: user.teacherId });
  redirect("/manage/staff/tasks?saved=1");
}

export async function updateStaffTaskStatus(formData: FormData): Promise<void> {
  await requireOwner();
  const taskId = String(formData.get("taskId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (taskId && isStaffTaskStatus(status)) await setStaffTaskStatus(taskId, status);
  // return to the filtered view the action was triggered from
  const back = String(formData.get("back") ?? "").trim();
  redirect(back.startsWith("/manage/staff/tasks") ? back : "/manage/staff/tasks");
}

export async function paySalary(formData: FormData): Promise<void> {
  await requireOwner();
  const staffId = String(formData.get("staffId") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "cash");
  const method = isFeeMethod(methodRaw) ? methodRaw : "cash";
  const note = String(formData.get("note") ?? "").trim();
  if (!staffId || !isPeriod(period)) redirect("/manage/staff/payroll");
  const back = `/manage/staff/payroll/${staffId}?month=${period}`;
  // whole-rupee integer only (rejects "500.50", "500abc", "" — matches fees)
  if (!isInt(amountRaw) || Number(amountRaw) <= 0) redirect(`${back}&error=amount`);
  const date = await effectiveToday();
  await recordSalaryPayment({ staffId, period, amount: Number(amountRaw), date, method, note });
  redirect(`${back}&saved=1`);
}

export async function adjustSalary(formData: FormData): Promise<void> {
  await requireOwner();
  const staffId = String(formData.get("staffId") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  const kind = String(formData.get("kind") ?? "bonus") === "deduction" ? "deduction" : "bonus";
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!staffId || !isPeriod(period)) redirect("/manage/staff/payroll");
  const back = `/manage/staff/payroll/${staffId}?month=${period}`;
  if (!isInt(amountRaw) || Number(amountRaw) <= 0) redirect(`${back}&error=amount`);
  await addSalaryAdjustment({ staffId, period, kind, amount: Number(amountRaw), note });
  redirect(`${back}&saved=1`);
}

export async function voidSalaryItem(formData: FormData): Promise<void> {
  await requireOwner();
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();
  if (id && kind === "payment") await voidSalaryPayment(id);
  else if (id && kind === "adjustment") await voidSalaryAdjustment(id);
  redirect(back.startsWith("/manage/staff/payroll") ? back : "/manage/staff/payroll");
}

// ---------------- C1 Students ----------------

export async function saveStudent(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("studentId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const joinDate = String(formData.get("joinDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const back = id ? `/manage/students/${id}` : "/manage/students/new";

  if (!name || !isDate(joinDate)) redirect(`${back}?error=missing`);
  if (phone && !isPhone(phone)) redirect(`${back}?error=phone`);
  if (parentPhone && !isPhone(parentPhone)) redirect(`${back}?error=phone`);

  const payload = { name, phone, parent_phone: parentPhone, join_date: joinDate, notes };
  if (id) await updateStudent(id, payload);
  else await createStudent(payload);
  redirect("/manage/students?saved=1");
}

export async function toggleStudentActive(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("studentId") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect("/manage/students");
  await setStudentActive(id, active);
  redirect(`/manage/students/${id}?saved=1`);
}

// ---------------- C2 Batches ----------------

export async function saveBatch(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("batchId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const fee = String(formData.get("fee") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const expectedEndDate = String(formData.get("expectedEndDate") ?? "").trim();
  const back = id ? `/manage/batches/${id}` : "/manage/batches/new";

  if (!name || !subject || !teacherId || !roomId) redirect(`${back}?error=missing`);
  if (fee && !isInt(fee)) redirect(`${back}?error=fee`);
  if (startDate && expectedEndDate && expectedEndDate < startDate) {
    redirect(`${back}?error=range`);
  }
  // N7: teacher/room must exist. A batch may keep an already-deactivated teacher
  // (the edit form surfaces it), so don't require the teacher to be active here.
  if (!(await refsExist({ teacherId, roomId, teacherMustBeActive: false }))) {
    redirect(`${back}?error=missing`);
  }

  const payload = {
    name, subject, teacher_id: teacherId, room_id: roomId, fee, level,
    start_date: startDate, expected_end_date: expectedEndDate,
  };
  if (id) await updateBatch(id, payload);
  else await createBatch(payload);
  redirect("/manage/batches?saved=1");
}

export async function toggleBatchActive(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("batchId") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect("/manage/batches");
  await setBatchActive(id, active);
  redirect(`/manage/batches/${id}?saved=1`);
}

// ---------------- C3 Enrollments ----------------

export async function addEnrollment(formData: FormData): Promise<void> {
  await requireOwner();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const batchId = String(formData.get("batchId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/batches");
  if (!studentId || !batchId || !isDate(startDate)) redirect(`${back}?error=missing`);
  if (!(await refsExist({ studentId, batchId }))) redirect(`${back}?error=missing`); // N7
  if (await enrollmentExists(studentId, batchId)) redirect(`${back}?error=dup`);
  const warn = await enrollmentClash(studentId, batchId);
  await createEnrollment({ student_id: studentId, batch_id: batchId, start_date: startDate });
  redirect(`${back}?enrolled=1${warn ? "&warn=student" : ""}`);
}

export async function endEnrollmentAction(formData: FormData): Promise<void> {
  await requireOwner();
  const enrollId = String(formData.get("enrollId") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/batches");
  if (!enrollId || !isDate(endDate)) redirect(`${back}?error=missing`);
  const e = await getEnrollment(enrollId);
  if (e && e.start_date > endDate) redirect(`${back}?error=range`);
  await endEnrollment(enrollId, endDate);
  redirect(`${back}?ended=1`);
}

// ---------------- C7 Settings ----------------

export async function saveSettings(formData: FormData): Promise<void> {
  await requireOwner();
  const centerName = String(formData.get("centerName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const threshold = String(formData.get("threshold") ?? "").trim();
  const followupStreak = String(formData.get("followupStreak") ?? "").trim();
  const weekStart = String(formData.get("weekStart") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const buffer = String(formData.get("buffer") ?? "").trim();
  const termStart = String(formData.get("termStart") ?? "").trim();
  const termEnd = String(formData.get("termEnd") ?? "").trim();

  if (!centerName) redirect("/manage/settings?error=missing");
  if (!isInt(threshold) || Number(threshold) > 100) redirect("/manage/settings?error=threshold");
  if (!isInt(followupStreak) || Number(followupStreak) < 2 || Number(followupStreak) > 10)
    redirect("/manage/settings?error=streak");
  if (!isInt(buffer) || Number(buffer) > 180) redirect("/manage/settings?error=buffer");
  // term dates are optional, but if given must be valid and ordered
  if (termStart && !isDate(termStart)) redirect("/manage/settings?error=term");
  if (termEnd && !isDate(termEnd)) redirect("/manage/settings?error=term");
  // require end strictly after start — a zero-length term has no pace to track
  // (and computeProgressSummary would treat end===start as "no term" anyway)
  if (termStart && termEnd && termEnd <= termStart) redirect("/manage/settings?error=term");

  await updateCenterConfig({
    center_name: centerName,
    // skip empty timezone so clearing the field keeps the existing value rather
    // than persisting "" (which would defeat getCenterConfig's default fallback)
    timezone: timezone || undefined,
    attendance_threshold: threshold,
    absence_followup_streak: followupStreak,
    week_start: weekStart,
    logo_url: logoUrl,
    room_changeover_buffer_min: buffer,
    // term dates: persist as-is — empty clears them (on-track verdict hides)
    term_start: termStart,
    term_end: termEnd,
  });
  redirect("/manage/settings?saved=1");
}

// ---------------- P3 Curriculum progress ----------------

export async function setProgress(formData: FormData): Promise<void> {
  await requireOwner();
  const batchId = String(formData.get("batchId") ?? "").trim();
  const chapterId = String(formData.get("chapterId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!batchId) redirect("/manage/batches");
  const back = `/manage/batches/${batchId}/progress`;
  if (!chapterId || !isProgressStatus(status)) redirect(back);
  await setChapterProgress(batchId, chapterId, status);
  redirect(`${back}?saved=1`);
}

// ---------------- P2 Curriculum (courses + chapters) ----------------

export async function saveCourse(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("courseId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const back = id ? `/manage/curriculum/${id}/edit` : "/manage/curriculum/new";
  if (!subject || !level || !name) redirect(`${back}?error=missing`);

  const payload = { subject, level, name, description };
  const target = id || (await createCourse(payload));
  if (id) await updateCourse(id, payload);
  redirect(`/manage/curriculum/${target}?saved=1`);
}

export async function toggleCourseActive(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("courseId") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect("/manage/curriculum");
  await setCourseActive(id, active);
  redirect(`/manage/curriculum/${id}?saved=1`);
}

export async function saveChapter(formData: FormData): Promise<void> {
  await requireOwner();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const chapterId = String(formData.get("chapterId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const topics = String(formData.get("topics") ?? "").trim();
  const resourceUrl = String(formData.get("resourceUrl") ?? "").trim();
  if (!courseId) redirect("/manage/curriculum");
  // an edit form lives on its own page; the add form lives on the course detail
  const back = chapterId
    ? `/manage/curriculum/${courseId}/chapters/${chapterId}`
    : `/manage/curriculum/${courseId}`;
  if (!title) redirect(`${back}?error=missing`);
  if (resourceUrl && !/^https?:\/\/\S+$/i.test(resourceUrl)) redirect(`${back}?error=url`);

  if (chapterId)
    await updateChapter(chapterId, { title, topics, resource_url: resourceUrl });
  else
    await createChapter({ course_id: courseId, title, topics, resource_url: resourceUrl });
  redirect(`/manage/curriculum/${courseId}?saved=1`);
}

export async function deleteChapterAction(formData: FormData): Promise<void> {
  await requireOwner();
  const chapterId = String(formData.get("chapterId") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) redirect("/manage/curriculum");
  if (chapterId) await deleteChapter(chapterId);
  redirect(`/manage/curriculum/${courseId}?deleted=1`);
}

export async function moveChapterAction(formData: FormData): Promise<void> {
  await requireOwner();
  const chapterId = String(formData.get("chapterId") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const dir = String(formData.get("dir") ?? "") === "up" ? "up" : "down";
  if (!courseId) redirect("/manage/curriculum");
  if (chapterId) await moveChapter(chapterId, dir);
  redirect(`/manage/curriculum/${courseId}`);
}

// ============================================================================
// Fees actions — all owner-only (requireOwner as line 1 per convention).
// Redirects are always at the top level, never inside try/catch.
// ============================================================================

const isPeriod = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export async function generateMonthlyChargesAction(formData: FormData): Promise<void> {
  await requireOwner();
  const rawPeriod = String(formData.get("period") ?? "").trim();
  // fall back to current centre period when the field is blank
  const period = rawPeriod !== "" ? rawPeriod : await currentPeriod();
  if (!isPeriod(period)) redirect("/manage/fees?error=period");
  const n = await generateMonthlyCharges(period);
  redirect(`/manage/fees?generated=${n}&period=${period}`);
}

export async function addChargeAction(formData: FormData): Promise<void> {
  await requireOwner();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const batchId = String(formData.get("batchId") ?? "").trim();
  const rawPeriod = String(formData.get("period") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/fees");

  if (!studentId || !isChargeKind(kind)) redirect(`${back}?error=missing`);
  if (!isInt(rawAmount) || Number(rawAmount) <= 0) redirect(`${back}?error=amount`);
  if (rawPeriod !== "" && !isPeriod(rawPeriod)) redirect(`${back}?error=period`);
  if (!(await refsExist({ studentId }))) redirect(`${back}?error=missing`);

  const amount = parseInt(rawAmount, 10);

  // discount bound: must not exceed the current net outstanding
  if (kind === "discount") {
    const out = await currentNetOutstanding(studentId);
    if (Math.abs(amount) > out) redirect(`${back}?error=overdiscount`);
  }

  await addCharge({
    studentId,
    batchId,
    period: rawPeriod,
    kind,
    amount,
    note,
  });
  redirect(`${back}?charged=1`);
}

export async function voidChargeAction(formData: FormData): Promise<void> {
  await requireOwner();
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/fees");
  if (chargeId) await voidCharge(chargeId);
  redirect(`${back}?voided=1`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  await requireOwner();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/fees");

  if (!studentId || !isFeeMethod(method)) redirect(`${back}?error=missing`);
  if (!isInt(rawAmount) || Number(rawAmount) <= 0) redirect(`${back}?error=amount`);
  if (!isDate(date)) redirect(`${back}?error=date`);
  if (!(await refsExist({ studentId }))) redirect(`${back}?error=missing`);

  await recordPayment({
    studentId,
    amount: parseInt(rawAmount, 10),
    date,
    method: method as import("@/lib/types").FeeMethod,
    note,
  });
  redirect(`${back}?paid=1`);
}

export async function voidPaymentAction(formData: FormData): Promise<void> {
  await requireOwner();
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/fees");
  if (paymentId) await voidPayment(paymentId);
  redirect(`${back}?pvoided=1`);
}

// ============================================================================
// PTM actions — all owner-only (requireOwner line 1). teacher_id is the acting
// owner. Redirects stay at the top level, never inside try/catch.
// ============================================================================

const isMetWith = (s: string) => s.length > 0 && s.length <= 40;

export async function schedulePtmAction(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/ptm");

  if (!studentId || !isPtmMode(mode)) redirect(`${back}?error=missing`);
  if (!isDate(date)) redirect(`${back}?error=date`);
  if (!(await refsExist({ studentId }))) redirect(`${back}?error=missing`);

  await appendPtm({
    studentId,
    date,
    mode: mode as PtmMode,
    metWith: "",
    teacherId: user.teacherId,
    summary: String(formData.get("summary") ?? "").trim(),
    status: "scheduled",
  });
  redirect(`${back}?scheduled=1`);
}

export async function logPtmAction(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const metWith = String(formData.get("metWith") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/ptm");

  if (!studentId || !isPtmMode(mode) || !isMetWith(metWith)) redirect(`${back}?error=missing`);
  if (!isDate(date)) redirect(`${back}?error=date`);
  if (!(await refsExist({ studentId }))) redirect(`${back}?error=missing`);

  await appendPtm({
    studentId,
    date,
    mode: mode as PtmMode,
    metWith,
    teacherId: user.teacherId,
    summary,
    status: "done",
  });
  redirect(`${back}?logged=1`);
}

export async function completePtmAction(formData: FormData): Promise<void> {
  await requireOwner();
  const ptmId = String(formData.get("ptmId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const metWith = String(formData.get("metWith") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/ptm");

  if (!ptmId || !isPtmMode(mode) || !isMetWith(metWith)) redirect(`${back}?error=missing`);
  if (!isDate(date)) redirect(`${back}?error=date`);

  await completePtm({ ptmId, date, mode: mode as PtmMode, metWith, summary });
  redirect(`${back}?logged=1`);
}

export async function setPtmStatusAction(formData: FormData): Promise<void> {
  await requireOwner();
  const ptmId = String(formData.get("ptmId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const back = safeBack(formData.get("back"), "/manage/ptm");
  // only these transitions are allowed via the status path (never scheduled/done)
  const allowed: PtmStatus[] = ["no_show", "cancelled", "void"];
  if (ptmId && isPtmStatus(status) && allowed.includes(status)) {
    await setPtmStatus(ptmId, status);
  }
  redirect(`${back}?updated=1`);
}
