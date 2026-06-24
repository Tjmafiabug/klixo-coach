import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTeacher, otherActiveOwners } from "@/lib/data";
import { saveTeacher, resetTeacherPin, toggleTeacherActive } from "@/lib/actions";
import { Banner, fieldClass, ActiveChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name and a valid phone number.";
  if (e === "phone") return "That phone number is already used by another teacher.";
  if (e === "pin") return "PIN must be 4–6 digits.";
  if (e === "lastowner") return "This is the last active owner — keep at least one owner.";
  return null;
}

export default async function EditTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; pinset?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [teacher, others, sp] = await Promise.all([
    getTeacher(id),
    otherActiveOwners(id),
    searchParams,
  ]);
  if (!teacher) notFound();
  const active = teacher.active === "TRUE";
  const isLastOwner = teacher.role === "owner" && others === 0;
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/teachers" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Teachers
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">Edit teacher</h1>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{teacher.teacher_id}</p>

      <div className="mt-3 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.pinset ? <Banner tone="success">PIN updated.</Banner> : null}
      </div>

      <form
        action={saveTeacher}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="teacherId" value={teacher.teacher_id} />
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" defaultValue={teacher.name} className={fieldClass} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Phone</span>
          <input name="phone" inputMode="numeric" defaultValue={teacher.phone} className={fieldClass} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Role</span>
          <select
            name="role"
            defaultValue={teacher.role}
            disabled={isLastOwner}
            className={`${fieldClass} cursor-pointer disabled:opacity-60`}
          >
            <option value="teacher">Teacher</option>
            <option value="owner">Owner</option>
          </select>
          {isLastOwner ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              Last active owner — role is locked.
            </span>
          ) : null}
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Subjects <span className="text-muted-foreground">(optional)</span>
          </span>
          <input name="subjects" defaultValue={teacher.subjects} className={fieldClass} />
        </label>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <form action={resetTeacherPin} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Reset PIN</p>
        <input type="hidden" name="teacherId" value={teacher.teacher_id} />
        <div className="mt-2 flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-xs font-medium">New PIN (4–6 digits)</span>
            <input name="pin" inputMode="numeric" placeholder="1234" className={fieldClass} />
          </label>
          <button className="h-11 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
            Set PIN
          </button>
        </div>
      </form>

      <form action={toggleTeacherActive} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <input type="hidden" name="teacherId" value={teacher.teacher_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate teacher" : "Reactivate teacher"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? "They can no longer sign in. Existing records are kept."
            : "Restores their ability to sign in."}
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
