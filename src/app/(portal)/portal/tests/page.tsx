import { requireStudent } from "@/lib/portal";
import { getStudentTests } from "@/lib/data";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { Pill } from "@/components/ui";

/** Why a submission was refused, in words a parent can act on. submitAttempt
 *  writes nothing in these cases, so the student's answers are genuinely gone —
 *  say so plainly rather than implying the test was saved. */
const SUBMIT_ERROR: Record<string, string> = {
  "already-done": "You have already submitted this test, so this attempt was not saved.",
  "not-available":
    "This test is no longer open to you, so your answers were not saved. Ask your teacher.",
  "not-found": "That test no longer exists, so your answers were not saved.",
};

export default async function PortalTests({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { studentId } = await requireStudent();
  const { error } = await searchParams;
  const tests = await getStudentTests(studentId);
  const todo = tests.filter((t) => !t.attempt);
  const done = tests.filter((t) => t.attempt);

  return (
    <div>
      <PortalTitle title="Tests" sub="Take your assigned tests and see your scores." />

      {error && SUBMIT_ERROR[error] ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger"
        >
          {SUBMIT_ERROR[error]}
        </div>
      ) : null}

      {tests.length === 0 ? (
        <Tile>
          <p className="text-sm text-muted-foreground">No tests assigned yet.</p>
        </Tile>
      ) : (
        <div className="space-y-5">
          {todo.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-sm font-semibold text-foreground">To do</p>
              <div className="space-y-2">
                {todo.map((t) => (
                  <Tile key={t.test_id} href={`/portal/tests/${t.test_id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.batchName} · {t.questionCount} questions · {t.totalMarks} marks
                        {t.duration_min ? ` · ${t.duration_min} min` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground">Start</span>
                  </Tile>
                ))}
              </div>
            </div>
          ) : null}

          {done.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-sm font-semibold text-foreground">Completed</p>
              <div className="space-y-2">
                {done.map((t) => (
                  <Tile key={t.test_id} href={`/portal/tests/${t.test_id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.batchName}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {t.attempt!.score}/{t.attempt!.max}
                      </span>
                      <Pill tone={t.attempt!.passed ? "success" : "danger"}>{t.attempt!.passed ? "Pass" : "Fail"}</Pill>
                    </span>
                  </Tile>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
