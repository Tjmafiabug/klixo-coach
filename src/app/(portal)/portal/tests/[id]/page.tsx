import Link from "next/link";
import { requireStudent } from "@/lib/portal";
import { getAttemptResult, getTestForTaking } from "@/lib/data";
import { submitTestAction } from "@/lib/actions";
import { PortalTitle, Tile, Ring } from "@/components/portal-ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { OptionKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalTakeTest({ params }: { params: Promise<{ id: string }> }) {
  const { studentId } = await requireStudent();
  const { id } = await params;

  // If they've already attempted, show the result (scoped to this student).
  const result = await getAttemptResult(id, studentId);
  if (result) {
    const pct = result.max ? Math.round((result.score / result.max) * 100) : 0;
    return (
      <div>
        <Back />
        <PortalTitle title={result.test.title} sub="Your result" />
        <Tile className="mb-5 flex flex-col items-center gap-2 text-center">
          <Ring pct={pct} tone={result.passed ? "success" : "danger"} label={`${result.score}/${result.max}`} sub={`${pct}%`} />
          <p className={`text-sm font-semibold ${result.passed ? "text-success" : "text-danger"}`}>
            {result.passed ? "Passed" : "Not passed"} · pass mark {result.passPct}%
          </p>
        </Tile>

        <p className="mb-2 px-1 text-sm font-semibold text-foreground">Review</p>
        <ol className="space-y-3">
          {result.questions.map((q, i) => (
            <li key={i} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{i + 1}.</span> {q.text}
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {q.options.map((o) => {
                  const isCorrect = o.key === q.correctKey;
                  const isChosen = o.key === q.chosen;
                  return (
                    <li
                      key={o.key}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                        isCorrect
                          ? "border-success/30 bg-success-subtle text-success"
                          : isChosen
                            ? "border-danger/30 bg-danger-subtle text-danger"
                            : "border-border text-foreground"
                      }`}
                    >
                      <span className="font-mono text-xs font-bold">{o.key}</span>
                      <span className="min-w-0 truncate">{o.text}</span>
                      {isCorrect ? <span className="ml-auto text-xs font-semibold">✓</span> : isChosen ? <span className="ml-auto text-xs font-semibold">your answer</span> : null}
                    </li>
                  );
                })}
                {q.chosen === "" ? <li className="text-xs text-muted-foreground">You left this blank.</li> : null}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // Otherwise, present the test for taking (guards run server-side).
  const take = await getTestForTaking(id, studentId);
  if (!take.ok) {
    const msg =
      take.reason === "already-done"
        ? "You've already taken this test."
        : take.reason === "not-found"
          ? "Test not found."
          : "This test isn't available to you.";
    return (
      <div>
        <Back />
        <Tile className="mt-4">
          <p className="text-sm text-muted-foreground">{msg}</p>
        </Tile>
      </div>
    );
  }

  const totalMarks = take.questions.reduce((s, q) => s + q.marks, 0);
  const OPTS: OptionKey[] = ["A", "B", "C", "D"];

  return (
    <div>
      <Back />
      <PortalTitle title={take.test.title} sub={`${take.questions.length} questions · ${totalMarks} marks`} />
      {take.test.negative_marking === "TRUE" ? (
        <p className="mb-4 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2 text-xs font-medium text-warning">
          Negative marking: −{take.test.marks_to_cut} for each wrong answer. Leave blank if unsure.
        </p>
      ) : null}

      <form action={submitTestAction}>
        <input type="hidden" name="testId" value={take.test.test_id} />
        <ol className="space-y-4">
          {take.questions.map((q, i) => (
            <li key={q.question_id} className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{i + 1}.</span> {q.text}
                <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">({q.marks})</span>
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:checked]:text-brand"
                  >
                    <input type="radio" name={`chosen_${q.question_id}`} value={o.key} className="sr-only" />
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border font-mono text-xs font-bold">
                      {o.key}
                    </span>
                    <span className="min-w-0">{o.text}</span>
                  </label>
                ))}
                {/* allow clearing to blank (avoids a forced guess under negative marking) */}
                {OPTS.length ? (
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1 text-xs text-muted-foreground">
                    <input type="radio" name={`chosen_${q.question_id}`} value="" defaultChecked className="sr-only" />
                    <span>Leave blank</span>
                  </label>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="sticky bottom-20 mt-5">
          <SubmitButton pendingText="Submitting…">Submit test</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function Back() {
  return (
    <Link href="/portal/tests" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ← Tests
    </Link>
  );
}
