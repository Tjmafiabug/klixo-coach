import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBatchDetail, getFormOptions, effectiveToday } from "@/lib/data";
import { saveBatch, toggleBatchActive, addEnrollment, endEnrollmentAction } from "@/lib/actions";
import { Banner, fieldClass, ActiveChip, OnTrackChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ExportButton } from "@/components/ExportButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Check the required fields.";
  if (e === "fee") return "Fee must be a whole number.";
  if (e === "dup") return "That student is already enrolled here.";
  if (e === "range") return "End date can't be before the start date.";
  return null;
}

export default async function EditBatchPage({
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
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [detail, options, today, sp] = await Promise.all([
    getBatchDetail(id),
    getFormOptions(),
    effectiveToday(),
    searchParams,
  ]);
  if (!detail) notFound();
  const { batch, teacherName, enrollments, candidates, course, progress } = detail;
  const active = batch.active === "TRUE";
  const back = `/manage/batches/${id}`;
  const err = errorText(sp.error);

  // keep the assigned teacher selectable even if they've been deactivated
  const teacherOptions = options.teachers.some((t) => t.id === batch.teacher_id)
    ? options.teachers
    : [{ id: batch.teacher_id, name: `${teacherName} (inactive)` }, ...options.teachers];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link href="/manage/batches" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Batches
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight">{batch.name}</h2>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{batch.batch_id}</p>

      <div className="mt-4 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.saved ? <Banner tone="success">Batch saved.</Banner> : null}
        {sp.enrolled ? <Banner tone="success">Student enrolled.</Banner> : null}
        {sp.ended ? <Banner tone="success">Enrollment ended.</Banner> : null}
        {sp.warn === "student" ? (
          <Banner tone="warning">Enrolled despite a timetable clash with another batch.</Banner>
        ) : null}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      {/* Edit details */}
      <form
        action={saveBatch}
        className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold text-foreground">Details</p>
        <input type="hidden" name="batchId" value={batch.batch_id} />
        <label className="mt-3 block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" defaultValue={batch.name} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Subject</span>
          <input name="subject" defaultValue={batch.subject} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Teacher</span>
            <select name="teacherId" defaultValue={batch.teacher_id} className={`${fieldClass} cursor-pointer`}>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Room</span>
            <select name="roomId" defaultValue={batch.room_id} className={`${fieldClass} cursor-pointer`}>
              {options.rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Fee</span>
            <input name="fee" inputMode="numeric" defaultValue={batch.fee} className={fieldClass} aria-invalid={sp.error === "fee" || undefined} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Level</span>
            <input name="level" defaultValue={batch.level} className={fieldClass} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">
              Start date <span className="text-muted-foreground">(optional)</span>
            </span>
            <input type="date" name="startDate" defaultValue={batch.start_date || ""} className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Expected end <span className="text-muted-foreground">(optional)</span>
            </span>
            <input type="date" name="expectedEndDate" defaultValue={batch.expected_end_date || ""} className={fieldClass} aria-invalid={sp.error === "range" || undefined} />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          After the expected end date, recurring classes stop appearing on the calendar.
        </p>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      {/* Enrollments */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            Students <span className="text-muted-foreground">({enrollments.filter((e) => e.status === "active" && !e.end_date).length} active)</span>
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/manage/batches/${batch.batch_id}/register`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-[0.98]"
            >
              Register
            </Link>
            <ExportButton kind="attendance" label="Export attendance" params={{ batch: batch.batch_id }} />
          </div>
        </div>
        {enrollments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No enrollments yet.</p>
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
                    <Link href={`/manage/students/${e.student_id}`} className="font-medium text-foreground hover:text-brand">
                      {e.studentName}
                    </Link>
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
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
            <input type="hidden" name="batchId" value={batch.batch_id} />
            <input type="hidden" name="back" value={back} />
            <label className="min-w-[10rem] flex-1">
              <span className="text-xs font-medium">Enroll student</span>
              <select name="studentId" className={`${fieldClass} cursor-pointer`}>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            All active students are already enrolled here.
          </p>
        )}
      </div>

      {/* Curriculum */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Curriculum</p>
          {progress ? <OnTrackChip onTrack={progress.onTrack} /> : null}
        </div>
        {course ? (
          <>
            <p className="mt-2 font-medium text-foreground">{course.name}</p>
            {progress && progress.total > 0 ? (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                  <span>
                    {progress.done}/{progress.total} done · {Math.round(progress.pct * 100)}%
                    {progress.inProgress > 0 ? ` · ${progress.inProgress} in progress` : ""}
                  </span>
                  {progress.termElapsedPct !== null ? (
                    <span>{Math.round(progress.termElapsedPct * 100)}% of term</span>
                  ) : null}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round(progress.pct * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/manage/batches/${batch.batch_id}/progress`}
                className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:brightness-95"
              >
                Update progress
              </Link>
              <Link
                href={`/manage/curriculum/${course.course_id}`}
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:border-brand/30"
              >
                View syllabus
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            No syllabus mapped for {batch.subject} · {batch.level} yet.
          </p>
        )}
      </div>

      {/* Active toggle */}
      <form action={toggleBatchActive} className="rounded-2xl border border-border bg-surface p-4">
        <input type="hidden" name="batchId" value={batch.batch_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate batch" : "Reactivate batch"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? "Hides it from new timetable rules and pickers. Existing sessions are kept."
            : "Returns it to pickers."}
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
      </div>
    </main>
  );
}
