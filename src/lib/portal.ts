import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * The portal trust boundary. Returns the logged-in student's own id + name from
 * the signed session — NEVER from a URL or form. Every portal read must scope to
 * this studentId so a student/parent can only ever see their own data.
 * Redirects non-students out (unauth → login; staff → their ops app).
 */
export async function requireStudent(): Promise<{ studentId: string; name: string }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "student") redirect(s.role === "owner" ? "/dashboard" : "/today");
  return { studentId: s.studentId, name: s.name };
}
