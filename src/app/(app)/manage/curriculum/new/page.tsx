import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { saveCourse } from "@/lib/actions";
import { Banner, fieldClass, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a subject, level and name.";
  return null;
}

export default async function NewCoursePage({
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
      <Link
        href="/manage/curriculum"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Curriculum
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Add course</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A syllabus per subject &amp; class. Add chapters after saving.
      </p>
      {err ? (
        <div className="mt-3">
          <Banner tone="danger">{err}</Banner>
        </div>
      ) : null}

      <form
        action={saveCourse}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Subject</span>
            <input
              name="subject"
              placeholder="Mathematics"
              className={fieldClass}
              aria-invalid={sp.error === "missing" || undefined}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Class / level</span>
            <input
              name="level"
              placeholder="Class 10"
              className={fieldClass}
              aria-invalid={sp.error === "missing" || undefined}
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            placeholder="Class 10 Mathematics"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Description <span className="text-muted-foreground">(optional)</span>
          </span>
          <textarea
            name="description"
            rows={3}
            placeholder="NCERT Class 10 Mathematics syllabus."
            className={textareaClass}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Subject + level link the course to a batch — match the batch&apos;s exactly.
        </p>
        <div className="mt-4">
          <SubmitButton pendingText="Adding…">Add course</SubmitButton>
        </div>
      </form>
    </main>
  );
}
