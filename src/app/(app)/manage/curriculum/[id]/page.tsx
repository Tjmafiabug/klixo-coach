import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCourseDetail } from "@/lib/data";
import { PageHeader } from "@/components/page";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const { id } = await params;
  const detail = await getCourseDetail(id);
  if (!detail) notFound();
  const { course, chapters } = detail;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage/curriculum"
        backLabel="Curriculum"
        title={course.name}
        subtitle={`${course.subject} · ${course.level} · ${chapters.length} chapters`}
      />

      {course.description ? (
        <Reveal>
          <p className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            {course.description}
          </p>
        </Reveal>
      ) : null}

      {chapters.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          No chapters added yet.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {chapters.map((ch, i) => (
            <Reveal key={ch.chapter_id} delay={Math.min(i * 0.03, 0.3)}>
              <li className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-subtle text-xs font-semibold text-brand tabular-nums">
                    {ch.order || i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{ch.title}</p>
                    {ch.topics ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ch.topics}
                      </p>
                    ) : null}
                    {ch.resource_url ? (
                      <a
                        href={ch.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      >
                        Resource ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      )}
    </div>
  );
}
