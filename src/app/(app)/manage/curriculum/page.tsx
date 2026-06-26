import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listCourses } from "@/lib/data";
import { Reveal } from "@/components/motion";
import { PageHeader, RowChevron } from "@/components/page";
import { ActiveChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CurriculumPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const courses = await listCourses();
  const totalChapters = courses.reduce((n, c) => n + c.chapters, 0);

  // group by level, preserving the level-then-subject order from listCourses
  const groups: { level: string; items: typeof courses }[] = [];
  for (const c of courses) {
    const g = groups.find((x) => x.level === c.level);
    if (g) g.items.push(c);
    else groups.push({ level: c.level, items: [c] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Curriculum"
        subtitle={`${courses.length} courses · ${totalChapters} chapters`}
      />

      <div className="mt-4">
        <Link
          href="/manage/curriculum/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:brightness-95"
        >
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          No courses yet. Add the first one above.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group, gi) => (
            <section key={group.level}>
              <h3 className="text-sm font-semibold text-muted-foreground">
                {group.level}
              </h3>
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.items.map((c, i) => (
                  <Reveal
                    key={c.course_id}
                    delay={Math.min(gi * 0.05 + i * 0.03, 0.3)}
                    className="h-full"
                  >
                    <li className="h-full">
                      <Link
                        href={`/manage/curriculum/${c.course_id}`}
                        className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-foreground">
                              {c.subject}
                            </p>
                            {!c.active ? <ActiveChip active={false} /> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {c.chapters} chapter{c.chapters === 1 ? "" : "s"}
                          </p>
                        </div>
                        <RowChevron />
                      </Link>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
