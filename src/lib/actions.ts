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
  getTeacher,
  createTeacher,
  updateTeacher,
  setTeacherPin,
  setTeacherActive,
  teacherPhoneTaken,
  otherActiveOwners,
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
} from "@/lib/data";
import { createSession, destroySession, getSession } from "@/lib/auth";
import { lockRemainingMs, recordFailure, recordSuccess } from "@/lib/rate-limit";
import type { AttendanceStatus } from "@/lib/types";

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
  await createSession({
    teacherId: teacher.teacher_id,
    role: teacher.role,
    name: teacher.name,
  });
  redirect(teacher.role === "owner" ? "/dashboard" : "/today");
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

// ---------------- C4 Teachers ----------------

export async function saveTeacher(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "teacher") === "owner" ? "owner" : "teacher";
  const subjects = String(formData.get("subjects") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const back = id ? `/manage/teachers/${id}` : "/manage/teachers/new";

  if (!name || !isPhone(phone)) redirect(`${back}?error=missing`);
  if (await teacherPhoneTaken(phone, id || undefined)) redirect(`${back}?error=phone`);

  if (id) {
    // demoting the last active owner would lock the centre out
    const cur = await getTeacher(id);
    if (cur?.role === "owner" && role !== "owner" && (await otherActiveOwners(id)) === 0) {
      redirect(`${back}?error=lastowner`);
    }
    await updateTeacher(id, { name, phone, role, subjects });
  } else {
    if (!isPin(pin)) redirect(`${back}?error=pin`);
    const pinHash = bcrypt.hashSync(pin, 10);
    await createTeacher({ name, phone, role, subjects, pinHash });
  }
  redirect("/manage/teachers?saved=1");
}

export async function resetTeacherPin(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!id) redirect("/manage/teachers");
  if (!isPin(pin)) redirect(`/manage/teachers/${id}?error=pin`);
  await setTeacherPin(id, bcrypt.hashSync(pin, 10));
  redirect(`/manage/teachers/${id}?pinset=1`);
}

export async function toggleTeacherActive(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("teacherId") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect("/manage/teachers");
  if (!active) {
    const cur = await getTeacher(id);
    if (cur?.role === "owner" && (await otherActiveOwners(id)) === 0) {
      redirect(`/manage/teachers/${id}?error=lastowner`);
    }
  }
  await setTeacherActive(id, active);
  redirect("/manage/teachers?saved=1");
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
  const back = id ? `/manage/batches/${id}` : "/manage/batches/new";

  if (!name || !subject || !teacherId || !roomId) redirect(`${back}?error=missing`);
  if (fee && !isInt(fee)) redirect(`${back}?error=fee`);
  // N7: teacher/room must exist. A batch may keep an already-deactivated teacher
  // (the edit form surfaces it), so don't require the teacher to be active here.
  if (!(await refsExist({ teacherId, roomId, teacherMustBeActive: false }))) {
    redirect(`${back}?error=missing`);
  }

  const payload = { name, subject, teacher_id: teacherId, room_id: roomId, fee, level };
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
  const weekStart = String(formData.get("weekStart") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const buffer = String(formData.get("buffer") ?? "").trim();

  if (!centerName) redirect("/manage/settings?error=missing");
  if (!isInt(threshold) || Number(threshold) > 100) redirect("/manage/settings?error=threshold");
  if (!isInt(buffer) || Number(buffer) > 180) redirect("/manage/settings?error=buffer");

  await updateCenterConfig({
    center_name: centerName,
    // skip empty timezone so clearing the field keeps the existing value rather
    // than persisting "" (which would defeat getCenterConfig's default fallback)
    timezone: timezone || undefined,
    attendance_threshold: threshold,
    week_start: weekStart,
    logo_url: logoUrl,
    room_changeover_buffer_min: buffer,
  });
  redirect("/manage/settings?saved=1");
}
