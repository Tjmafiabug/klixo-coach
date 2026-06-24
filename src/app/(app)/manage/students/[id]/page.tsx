import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStudentProfile,
  batchesForStudent,
  getCenterConfig,
  effectiveToday,
} from "@/lib/data";
import { saveStudent, toggleStudentActive, addEnrollment, endEnrollmentAction } from "@/lib/actions";
import { Banner, fieldClass, ActiveChip, PctBadge, StatusPill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Check the required fields.";
  if (e === "phone") return "Phone numbers must be 6–15 digits.";
  if (e === "dup") return "Already enrolled in that batch.";
  if (e === "range") return "End date can't be before the start date.";
  return null;
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    enrolled?: string;
    ended?: string;
    warn?: string;
  }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [profile, candidates, cfg, today, sp] = await Promise.all([
    getStudentProfile(id),
    batchesForStudent(id),
    getCenterConfig(),
    effectiveToday(),
    searchParams,
  ]);
  if (!profile) notFound();
  const { student, enrollments, history, present, total, pct } = profile;
  const active = student.status === "active";
  const threshold = parseInt(cfg.attendance_threshold, 10) || 75;
  const back = `/manage/students/${id}`;
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage/students" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Students
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{student.name}</h1>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {student.student_id} · joined {student.join_date}
      </p>

      <div className="mt-4 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.saved ? <Banner tone="success">Student saved.</Banner> : null}
        {sp.enrolled ? <Banner tone="success">Enrolled in batch.</Banner> : null}
        {sp.ended ? <Banner tone="success">Enrollment ended.</Banner> : null}
        {sp.warn === "student" ? (
          <Banner tone="warning">Enrolled despite a timetable clash with another batch.</Banner>
        ) : null}
      </div>

      {/* Attendance summary */}
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div>
          <p className="text-sm font-semibold text-foreground">Attendance</p>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {present}/{total} present
          </p>
        </div>
        {total > 0 ? <PctBadge pct={pct} threshold={threshold} /> : (
          <span className="text-sm text-muted-foreground">No marks yet</span>
        )}
      </div>

      {/* Edit details */}
      <form
        action={saveStudent}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold text-foreground">Details</p>
        <input type="hidden" name="studentId" value={student.student_id} />
        <label className="mt-3 block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" defaultValue={student.name} className={fieldClass} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Phone</span>
            <input name="phone" inputMode="numeric" defaultValue={student.phone} className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Parent phone</span>
            <input name="parentPhone" inputMode="numeric" defaultValue={student.parent_phone} className={fieldClass} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Join date</span>
          <input type="date" name="joinDate" defaultValue={student.join_date} className={fieldClass} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Notes</span>
          <input name="notes" defaultValue={student.notes} className={fieldClass} />
        </label>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      {/* Enrollments */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-foreground">Enrollments</p>
        {enrollments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Not enrolled in any batch.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {enrollments.map((e) => {
              const open = e.status === "active" && e.end_date === "";
              return (
                <li
                  key={e.enroll_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{e.batchName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {e.start_date} → {e.end_date || "present"} · {e.end_date ? "ended" : e.status}
                    </p>
                  </div>
                  {open ? (
                    <form action={endEnrollmentAction} className="flex items-end gap-2">
                      <input type="hidden" name="enrollId" value={e.enroll_id} />
                      <input type="hidden" name="back" value={back} />
                      <input
                        type="date"
                        name="endDate"
                        defaultValue={today}
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      <button className="h-9 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
                        End
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {candidates.length > 0 ? (
          <form action={addEnrollment} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <input type="hidden" name="studentId" value={student.student_id} />
            <input type="hidden" name="back" value={back} />
            <label className="min-w-[10rem] flex-1">
              <span className="text-xs font-medium">Add to batch</span>
              <select name="batchId" className={`${fieldClass} cursor-pointer`}>
                {candidates.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="w-40">
              <span className="text-xs font-medium">Start date</span>
              <input type="date" name="startDate" defaultValue={today} className={fieldClass} />
            </label>
            <div className="w-28">
              <SubmitButton pendingText="Adding…">Enroll</SubmitButton>
            </div>
          </form>
        ) : null}
      </div>

      {/* Attendance history */}
      {history.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-foreground">Recent attendance</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{h.date}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{h.batchName}</span>
                <span className="flex items-center gap-1.5">
                  {h.method === "manual" ? (
                    <span className="text-[0.7rem] font-semibold uppercase text-muted-foreground">manual</span>
                  ) : null}
                  <StatusPill status={h.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Active toggle */}
      <form action={toggleStudentActive} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <input type="hidden" name="studentId" value={student.student_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate student" : "Reactivate student"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? "Removes them from rosters going forward. History is kept."
            : "Returns them to active rosters."}
        </p>
        <button
          className={`mt-2 h-10 cursor-pointer rounded-lg border px-4 text-sm font-semibold transition-colors ${
            active
              ? "border-danger/30 bg-danger-subtle text-danger hover:bg-danger/10"
              : "border-success/30 bg-success-subtle text-success hover:bg-success/10"
          }`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
      </form>
    </main>
  );
}
