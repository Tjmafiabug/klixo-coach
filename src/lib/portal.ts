import "server-only";
import { redirect } from "next/navigation";
import { getSession, pinVersion } from "@/lib/auth";
import { getStudent } from "@/lib/data";

/**
 * The portal trust boundary. Returns the logged-in student's own id + name from
 * the signed session — NEVER from a URL or form. Every portal read must scope to
 * this studentId so a student/parent can only ever see their own data.
 * Redirects non-students out (unauth → login; staff → their ops app).
 *
 * Also re-checks the PIN fingerprint, so changing a student's PIN cuts off
 * sessions minted with the old one instead of leaving them valid for up to 12h.
 * The staff guards do the same. The Students tab is already in the per-request
 * batchGet that every portal page performs, so `getStudent` adds no round trip.
 */
export async function requireStudent(): Promise<{ studentId: string; name: string }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "student") redirect(s.role === "owner" ? "/dashboard" : "/today");
  const row = await getStudent(s.studentId);
  if (!row || row.status !== "active") redirect("/login?error=stale");
  if (s.pv !== pinVersion(row.pin_hash)) redirect("/login?error=stale");
  return { studentId: s.studentId, name: s.name };
}
