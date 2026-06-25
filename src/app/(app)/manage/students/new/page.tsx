import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { effectiveToday } from "@/lib/data";
import { saveStudent } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name and a join date.";
  if (e === "phone") return "Phone numbers must be 6–15 digits.";
  return null;
}

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [today, sp] = await Promise.all([effectiveToday(), searchParams]);
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/students" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Students
      </Link>
      <h1 className="mt-3 text-xl font-bold tracking-tight">Add student</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enroll them in batches after saving.</p>
      {err ? <div className="mt-3"><Banner tone="danger">{err}</Banner></div> : null}

      <form
        action={saveStudent}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">
              Phone <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="phone" inputMode="numeric" className={fieldClass} aria-invalid={sp.error === "phone" || undefined} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Parent phone <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="parentPhone" inputMode="numeric" className={fieldClass} aria-invalid={sp.error === "phone" || undefined} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Join date</span>
          <input type="date" name="joinDate" defaultValue={today} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Notes <span className="text-muted-foreground">(optional)</span>
          </span>
          <input name="notes" className={fieldClass} />
        </label>
        <div className="mt-4">
          <SubmitButton pendingText="Adding…">Add student</SubmitButton>
        </div>
      </form>
    </main>
  );
}
