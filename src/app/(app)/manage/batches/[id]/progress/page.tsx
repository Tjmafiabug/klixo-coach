import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBatchProgress } from "@/lib/data";
import { setProgress } from "@/lib/actions";
import { PageHeader } from "@/components/page";
import { Banner, OnTrackChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

const STATUS_OPTS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

export default async function BatchProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const { id } = await params;
  const [view, sp] = await Promise.all([getBatchProgress(id), searchParams]);
  if (!view) notFound();
  const { batch, course, chapters, summary, term } = view;

  const donePct = Math.round(summary.pct * 100);
  const termPct =
    summary.termElapsedPct !== null ? Math.round(summary.termElapsedPct * 100) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref={`/manage/batches/${id}`}
        backLabel={batch.name}
        title="Curriculum progress"
        subtitle={course ? course.name : `${batch.subject} · ${batch.level}`}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Progress updated.</Banner>
        </div>
      ) : null}

      {!course ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          No active syllabus maps to {batch.subject} · {batch.level}. Add or activate a
          course with that subject and class in{" "}
          <Link href="/manage/curriculum" className="font-medium text-brand hover:underline">
            Curriculum
          </Link>
          .
        </p>
      ) : chapters.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          {course.name} has no chapters yet.{" "}
          <Link
            href={`/manage/curriculum/${course.course_id}`}
            className="font-medium text-brand hover:underline"
          >
            Add chapters
          </Link>
          .
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {summary.done}/{summary.total} chapters done · {donePct}%
              </p>
              <OnTrackChip onTrack={summary.onTrack} />
            </div>
            <div className="relative mt-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${donePct}%` }}
                />
              </div>
              {termPct !== null ? (
                <span
                  className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 rounded bg-foreground/70"
                  style={{ left: `${termPct}%` }}
                  aria-hidden
                />
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {summary.inProgress > 0 ? `${summary.inProgress} in progress · ` : ""}
              {termPct !== null
                ? `term ${termPct}% elapsed (${term.start} → ${term.end})`
                : "Set term dates in Settings to pace against the academic term."}
            </p>
          </div>

          {/* Per-chapter status */}
          <ol className="mt-5 space-y-3">
            {chapters.map((ch, i) => (
              <Reveal key={ch.chapter_id} delay={Math.min(i * 0.03, 0.3)}>
                <li className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-subtle text-xs font-semibold text-brand tabular-nums">
                        {ch.order || i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{ch.title}</p>
                        {ch.status === "done" && ch.done_date ? (
                          <p className="mt-0.5 text-xs text-success tabular-nums">
                            Done {ch.done_date}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* segmented status control */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {STATUS_OPTS.map((opt) => {
                        const activeOpt = ch.status === opt.value;
                        return (
                          <form key={opt.value} action={setProgress}>
                            <input type="hidden" name="batchId" value={batch.batch_id} />
                            <input type="hidden" name="chapterId" value={ch.chapter_id} />
                            <input type="hidden" name="status" value={opt.value} />
                            <SubmitButton
                              disabled={activeOpt}
                              pendingText="·"
                              className={`inline-flex h-8 cursor-pointer items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:cursor-default ${
                                activeOpt
                                  ? "border-brand bg-brand text-brand-foreground"
                                  : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground"
                              }`}
                            >
                              {opt.label}
                            </SubmitButton>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
