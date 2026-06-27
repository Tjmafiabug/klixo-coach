import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStaff,
  otherActiveOwners,
  getStaffBatches,
  staffTypeOf,
  getStaffAttendanceSummary,
  getStaffOpenTasks,
} from "@/lib/data";
import { shortDate } from "@/lib/format";
import { saveStaff, resetStaffPin, toggleStaffActive } from "@/lib/actions";
import { Banner, fieldClass, ActiveChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name (and a valid phone if you give one).";
  if (e === "phone") return "That phone number is already used by someone else.";
  if (e === "pin") return "PIN must be 4–6 digits.";
  if (e === "lastowner") return "This is the last active owner — keep at least one owner.";
  return null;
}

export default async function EditStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; pinset?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [staff, others, batches, att, tasks, sp] = await Promise.all([
    getStaff(id),
    otherActiveOwners(id),
    getStaffBatches(id),
    getStaffAttendanceSummary(id),
    getStaffOpenTasks(id),
    searchParams,
  ]);
  if (!staff) notFound();
  const teaching = staffTypeOf(staff) === "teaching";
  const active = staff.active === "TRUE";
  const isLastOwner = staff.role === "owner" && others === 0;
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href="/manage/staff"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Staff
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight">
          {teaching ? "Edit teaching staff" : "Edit staff"}
        </h2>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {staff.teacher_id} · {teaching ? "Teaching" : "Non-teaching"}
      </p>

      <div className="mt-3 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.pinset ? <Banner tone="success">PIN updated.</Banner> : null}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            Attendance <span className="font-normal text-muted-foreground">· this month</span>
          </p>
          <Link
            href={`/manage/staff/attendance?date=${att.month}-01`}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Open register →
          </Link>
        </div>
        {att.marked === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No attendance marked this month.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium tabular-nums">
            <span className="text-success">{att.present} present</span>
            <span className="text-danger">{att.absent} absent</span>
            <span className="text-brand">{att.leave} leave</span>
            <span className="text-warning">{att.half_day} half-day</span>
            <span className="text-muted-foreground">· {att.marked} days marked</span>
          </div>
        )}
      </div>

      {tasks.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Open tasks{" "}
              <span className="font-normal text-muted-foreground">({tasks.length})</span>
            </p>
            <Link href="/manage/staff/tasks" className="text-xs font-semibold text-brand hover:underline">
              All tasks →
            </Link>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {tasks.slice(0, 5).map((t) => (
              <li
                key={t.task_id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-foreground">{t.title}</span>
                {t.due_date ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    due {shortDate(t.due_date)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {teaching ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-foreground">
            Batches{" "}
            <span className="font-normal text-muted-foreground">({batches.length})</span>
          </p>
          {batches.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No batches assigned.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {batches.map((b) => (
                <li key={b.batch_id}>
                  <Link
                    href={`/manage/batches/${b.batch_id}`}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                        {b.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[b.subject, b.level].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {!b.active ? <ActiveChip active={false} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <form
        action={saveStaff}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="teacherId" value={staff.teacher_id} />
        <input type="hidden" name="staff_type" value={teaching ? "teaching" : "non_teaching"} />

        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            defaultValue={staff.name}
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Phone {!teaching ? <span className="text-muted-foreground">(optional)</span> : null}
          </span>
          <input
            name="phone"
            inputMode="numeric"
            defaultValue={staff.phone}
            className={fieldClass}
            aria-invalid={sp.error === "missing" || sp.error === "phone" || undefined}
          />
        </label>

        {teaching ? (
          <>
            <label className="mt-3 block">
              <span className="text-sm font-medium">Role</span>
              <select
                name="role"
                defaultValue={staff.role === "owner" ? "owner" : "teacher"}
                disabled={isLastOwner}
                className={`${fieldClass} cursor-pointer disabled:opacity-60`}
              >
                <option value="teacher">Teacher</option>
                <option value="owner">Owner</option>
              </select>
              {/* a disabled <select> isn't submitted — carry the locked role so a
                  sole owner can still save their other field edits */}
              {isLastOwner ? (
                <>
                  <input type="hidden" name="role" value={staff.role} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Last active owner — role is locked.
                  </span>
                </>
              ) : null}
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium">
                Subjects <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="subjects" defaultValue={staff.subjects} className={fieldClass} />
            </label>
          </>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Designation</span>
              <input name="designation" defaultValue={staff.designation} className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                Department <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="department" defaultValue={staff.department} className={fieldClass} />
            </label>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">
              Joined <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="join_date" type="date" defaultValue={staff.join_date} className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Monthly salary <span className="text-muted-foreground">(optional)</span>
            </span>
            <input
              name="monthly_salary"
              inputMode="numeric"
              defaultValue={staff.monthly_salary}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Notes <span className="text-muted-foreground">(optional)</span>
          </span>
          <textarea name="notes" rows={2} defaultValue={staff.notes} className={fieldClass} />
        </label>

        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      {teaching ? (
        <form action={resetStaffPin} className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Reset PIN</p>
          <input type="hidden" name="teacherId" value={staff.teacher_id} />
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-xs font-medium">New PIN (4–6 digits)</span>
              <input
                name="pin"
                inputMode="numeric"
                placeholder="1234"
                className={fieldClass}
                aria-invalid={sp.error === "pin" || undefined}
              />
            </label>
            <button className="h-11 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              Set PIN
            </button>
          </div>
        </form>
      ) : null}

      <form action={toggleStaffActive} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <input type="hidden" name="teacherId" value={staff.teacher_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate" : "Reactivate"} {teaching ? "teacher" : "staff"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? teaching
              ? "They can no longer sign in. Existing records are kept."
              : "Marks them inactive. Existing records are kept."
            : teaching
              ? "Restores their ability to sign in."
              : "Marks them active again."}
        </p>
        <button
          disabled={active && isLastOwner}
          className={`mt-2 h-10 cursor-pointer rounded-lg border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            active
              ? "border-danger/30 bg-danger-subtle text-danger hover:bg-danger/10"
              : "border-success/30 bg-success-subtle text-success hover:bg-success/10"
          }`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
        {active && isLastOwner ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            Last active owner can&apos;t be deactivated.
          </span>
        ) : null}
      </form>
    </main>
  );
}
