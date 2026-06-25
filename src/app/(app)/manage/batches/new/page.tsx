import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFormOptions } from "@/lib/data";
import { saveBatch } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name, subject, teacher and room.";
  if (e === "fee") return "Fee must be a whole number.";
  return null;
}

export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [options, sp] = await Promise.all([getFormOptions(), searchParams]);
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/batches" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Batches
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Add batch</h2>
      <p className="mt-1 text-sm text-muted-foreground">Enroll students and add timetable rules after saving.</p>
      {err ? <div className="mt-3"><Banner tone="danger">{err}</Banner></div> : null}

      <form
        action={saveBatch}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" placeholder="Class 10 Maths" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Subject</span>
          <input name="subject" placeholder="Mathematics" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Teacher</span>
          <select name="teacherId" className={`${fieldClass} cursor-pointer`}>
            {options.teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Room</span>
          <select name="roomId" className={`${fieldClass} cursor-pointer`}>
            {options.rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">
              Fee <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="fee" inputMode="numeric" placeholder="1200" className={fieldClass} aria-invalid={sp.error === "fee" || undefined} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Level <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="level" placeholder="Class 10" className={fieldClass} />
          </label>
        </div>
        <div className="mt-4">
          <SubmitButton pendingText="Adding…">Add batch</SubmitButton>
        </div>
      </form>
    </main>
  );
}
