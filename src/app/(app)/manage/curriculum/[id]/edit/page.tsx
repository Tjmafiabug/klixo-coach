import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCourse } from "@/lib/data";
import { saveCourse, toggleCourseActive } from "@/lib/actions";
import { Banner, fieldClass, textareaClass, ActiveChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a subject, level and name.";
  return null;
}

export default async function EditCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [course, sp] = await Promise.all([getCourse(id), searchParams]);
  if (!course) notFound();
  const active = course.active === "TRUE";
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href={`/manage/curriculum/${id}`}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← {course.name}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight">Edit course</h2>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{course.course_id}</p>

      <div className="mt-4 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.saved ? <Banner tone="success">Course saved.</Banner> : null}
      </div>

      <form
        action={saveCourse}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="courseId" value={course.course_id} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Subject</span>
            <input
              name="subject"
              defaultValue={course.subject}
              className={fieldClass}
              aria-invalid={sp.error === "missing" || undefined}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Class / level</span>
            <input
              name="level"
              defaultValue={course.level}
              className={fieldClass}
              aria-invalid={sp.error === "missing" || undefined}
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            defaultValue={course.name}
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
            defaultValue={course.description}
            className={textareaClass}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Subject + level link the course to a batch — match the batch&apos;s exactly.
        </p>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <form
        action={toggleCourseActive}
        className="mt-4 rounded-2xl border border-border bg-surface p-4"
      >
        <input type="hidden" name="courseId" value={course.course_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate course" : "Reactivate course"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? "Marks it inactive and sorts it last. Chapters and batch links are kept."
            : "Returns it to the active list."}
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
