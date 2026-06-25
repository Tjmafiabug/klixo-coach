import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { saveTeacher } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name and a valid phone number.";
  if (e === "phone") return "That phone number is already used by another teacher.";
  if (e === "pin") return "PIN must be 4–6 digits.";
  return null;
}

export default async function NewTeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sp = await searchParams;
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/teachers" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Teachers
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Add teacher</h2>
      <p className="mt-1 text-sm text-muted-foreground">They sign in with phone + PIN.</p>
      {err ? <div className="mt-3"><Banner tone="danger">{err}</Banner></div> : null}

      <form
        action={saveTeacher}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Phone</span>
          <input name="phone" inputMode="numeric" placeholder="9876500000" className={fieldClass} aria-invalid={sp.error === "missing" || sp.error === "phone" || undefined} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Role</span>
            <select name="role" defaultValue="teacher" className={`${fieldClass} cursor-pointer`}>
              <option value="teacher">Teacher</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">PIN (4–6 digits)</span>
            <input name="pin" inputMode="numeric" placeholder="1234" className={fieldClass} aria-invalid={sp.error === "pin" || undefined} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Subjects <span className="text-muted-foreground">(optional)</span>
          </span>
          <input name="subjects" placeholder="Mathematics, Physics" className={fieldClass} />
        </label>
        <div className="mt-4">
          <SubmitButton pendingText="Adding…">Add teacher</SubmitButton>
        </div>
      </form>
    </main>
  );
}
