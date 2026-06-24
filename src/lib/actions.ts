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
} from "@/lib/data";
import { createSession, destroySession, getSession } from "@/lib/auth";
import type { AttendanceStatus } from "@/lib/types";

export interface LoginState {
  error?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!phone || !pin) return { error: "Enter phone and PIN." };

  const teacher = await getTeacherByPhone(phone);
  if (!teacher || !teacher.pin_hash || teacher.pin_hash.startsWith("<")) {
    return { error: "Invalid phone or PIN." };
  }
  const ok = await bcrypt.compare(pin, teacher.pin_hash);
  if (!ok) return { error: "Invalid phone or PIN." };

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

  // can't mark cancelled or future sessions
  const today = await effectiveToday();
  if (session.status === "cancelled" || session.date > today) {
    redirect("/today");
  }
  const isPast = session.date < today;

  const submitted = JSON.parse(String(formData.get("marks") ?? "[]")) as {
    studentId: string;
    status: AttendanceStatus;
  }[];
  const reasons = JSON.parse(String(formData.get("reasons") ?? "{}")) as Record<
    string,
    string
  >;
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
    const saved = savedByStudent.get(m.studentId) ?? null;
    if (saved === null) {
      // never marked → backfill (past) requires a reason; today is a normal app mark
      if (isPast) {
        if (!backfillReason) redirect(`/mark/${sessionId}?error=backfill`);
        writes.push({ studentId: m.studentId, status: m.status, method: "manual", reason: backfillReason });
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
  if (sessionId) await cancelSessionData(sessionId);
  redirect("/today?cancelled=1");
}

export async function substituteTeacher(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sessionId = String(formData.get("sessionId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");
  if (sessionId && teacherId) await setSubstitute(sessionId, teacherId);
  redirect(`/mark/${sessionId}`);
}

export async function runGeneration(): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { added } = await generateSessions();
  redirect(`/today?generated=${added}`);
}

export async function addExtraClass(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");

  const date = String(formData.get("date") ?? "").trim();
  const batchId = String(formData.get("batchId") ?? "").trim();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  if (!date || !batchId || !start || !end || !roomId || !teacherId) {
    redirect("/new-session?error=1");
  }
  await createExtraClass({ date, batchId, start, end, roomId, teacherId });
  redirect("/today?added=1");
}
