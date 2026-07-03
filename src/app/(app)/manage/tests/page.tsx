import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTestsOwner } from "@/lib/data";
import { Reveal } from "@/components/motion";
import { PageHeader, RowChevron } from "@/components/page";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const tests = await listTestsOwner();
  const published = tests.filter((t) => t.published).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Tests"
        subtitle={`${tests.length} test${tests.length === 1 ? "" : "s"} · ${published} published`}
      />

      <div className="mt-4">
        <Link
          href="/manage/tests/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:brightness-95"
        >
          + New test
        </Link>
      </div>

      {tests.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          No tests yet. Create one, add MCQ questions, then publish it to the batch.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((t, i) => (
            <Reveal key={t.test_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
              <li className="h-full">
                <Link
                  href={`/manage/tests/${t.test_id}`}
                  className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{t.title}</p>
                      <Pill tone={t.published ? "success" : "neutral"} dot={t.published}>
                        {t.published ? "Live" : "Draft"}
                      </Pill>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.batchName}</p>
                    <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                      {t.questionCount} Q · {t.totalMarks} marks · {t.attemptCount} attempt
                      {t.attemptCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <RowChevron />
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
