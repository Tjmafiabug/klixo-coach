import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTestBuild, getTestResultsOwner } from "@/lib/data";
import { addQuestionAction, deleteQuestionAction, toggleTestPublishedAction } from "@/lib/actions";
import { Banner, Pill, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { OptionKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const OPTS: OptionKey[] = ["A", "B", "C", "D"];

function banner(sp: Record<string, string | undefined>) {
  if (sp.error === "options") return { tone: "danger" as const, msg: "Give at least two options." };
  if (sp.error === "correct") return { tone: "danger" as const, msg: "Mark which option is correct (and fill it in)." };
  if (sp.error === "marks") return { tone: "danger" as const, msg: "Marks must be a positive whole number." };
  if (sp.error === "missing") return { tone: "danger" as const, msg: "Enter the question text." };
  if (sp.added) return { tone: "success" as const, msg: "Question added." };
  if (sp.qdeleted) return { tone: "success" as const, msg: "Question removed." };
  if (sp.published) return { tone: "success" as const, msg: "Test published — students can now take it." };
  if (sp.unpublished) return { tone: "warning" as const, msg: "Test unpublished — hidden from students." };
  return null;
}

export default async function TestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const sp = await searchParams;

  const [build, results] = await Promise.all([getTestBuild(id), getTestResultsOwner(id)]);
  if (!build) notFound();
  const { test, batchName, questions, totalMarks } = build;
  const published = test.published === "TRUE";
  const frozen = (results?.attempted ?? 0) > 0; // has graded attempts → no edits
  const b = banner(sp);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/manage/tests" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Tests
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">{test.title}</h2>
            <Pill tone={published ? "success" : "neutral"} dot={published}>{published ? "Live" : "Draft"}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {batchName} · {questions.length} Q · {totalMarks} marks · pass {test.pass_pct}%
            {test.negative_marking === "TRUE" ? ` · −${test.marks_to_cut} per wrong` : ""}
            {test.duration_min ? ` · ${test.duration_min} min` : ""}
          </p>
        </div>
        <form action={toggleTestPublishedAction}>
          <input type="hidden" name="testId" value={test.test_id} />
          <input type="hidden" name="publish" value={published ? "0" : "1"} />
          <SubmitButton
            pendingText="…"
            disabled={!published && questions.length === 0}
            className={
              published
                ? "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                : "inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-50"
            }
          >
            {published ? "Unpublish" : "Publish"}
          </SubmitButton>
        </form>
      </div>

      {b ? (
        <div className="mt-4">
          <Banner tone={b.tone}>{b.msg}</Banner>
        </div>
      ) : null}

      {/* Questions */}
      <h3 className="mt-6 text-sm font-semibold text-muted-foreground">Questions</h3>
      {questions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No questions yet — add the first below.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {questions.map((q, i) => {
            const opts = [q.opt_a, q.opt_b, q.opt_c, q.opt_d];
            return (
              <li key={q.question_id} className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-muted-foreground">{i + 1}.</span> {q.text}
                    <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">({q.marks} mark{q.marks === "1" ? "" : "s"})</span>
                  </p>
                  {!frozen ? (
                    <form action={deleteQuestionAction}>
                      <input type="hidden" name="questionId" value={q.question_id} />
                      <input type="hidden" name="testId" value={test.test_id} />
                      <button className="shrink-0 text-xs font-medium text-danger hover:underline" type="submit">
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
                <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {OPTS.map((k, oi) =>
                    opts[oi] ? (
                      <li
                        key={k}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                          q.correct === k
                            ? "border-success/30 bg-success-subtle text-success"
                            : "border-border text-foreground"
                        }`}
                      >
                        <span className="font-mono text-xs font-bold">{k}</span>
                        <span className="min-w-0 truncate">{opts[oi]}</span>
                        {q.correct === k ? <span className="ml-auto text-xs font-semibold">✓ correct</span> : null}
                      </li>
                    ) : null,
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {/* Add question */}
      {frozen ? (
        <p className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          This test has graded attempts — questions are locked to keep scores consistent.
        </p>
      ) : (
        <form
          action={addQuestionAction}
          className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
        >
          <input type="hidden" name="testId" value={test.test_id} />
          <p className="text-sm font-semibold text-foreground">Add a question</p>
          <label className="mt-3 block">
            <span className="text-sm font-medium">Question</span>
            <input name="text" placeholder="What is 7 × 8?" className={fieldClass} />
          </label>
          <div className="mt-3 grid grid-cols-1 gap-2.5">
            {OPTS.map((k) => (
              <label key={k} className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-sm font-bold text-muted-foreground">
                  {k}
                </span>
                <input name={`opt${k}`} placeholder={`Option ${k}`} className={`${fieldClass} mt-0`} />
              </label>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Correct option</span>
              <select name="correct" className={fieldClass} defaultValue="A">
                {OPTS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Marks</span>
              <input name="marks" type="number" min={1} defaultValue={1} inputMode="numeric" className={fieldClass} />
            </label>
          </div>
          <div className="mt-4">
            <SubmitButton pendingText="Adding…">Add question</SubmitButton>
          </div>
        </form>
      )}

      {/* Results */}
      {results ? (
        <section className="mt-8">
          <h3 className="text-sm font-semibold text-muted-foreground">Results</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Attempted" value={`${results.attempted}/${results.rosterSize}`} />
            <Stat label="Average" value={results.average != null ? `${results.average}/${results.max}` : "—"} />
            <Stat label="Passed" value={results.attempted ? `${results.passed}/${results.attempted}` : "—"} />
          </div>
          {results.rows.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {results.rows.map((r) => (
                <li key={r.studentId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{r.name}</span>
                  {r.taken ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {r.score}/{results.max}
                      </span>
                      <Pill tone={r.passed ? "success" : "danger"}>{r.passed ? "Pass" : "Fail"}</Pill>
                    </span>
                  ) : (
                    <Pill tone="neutral" dot={false}>Not taken</Pill>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No students enrolled in this batch yet.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-center shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
