import { requireStudent } from "@/lib/portal";
import { getStudentTests } from "@/lib/data";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { Pill } from "@/components/ui";

export default async function PortalTests() {
  const { studentId } = await requireStudent();
  const tests = await getStudentTests(studentId);
  const todo = tests.filter((t) => !t.attempt);
  const done = tests.filter((t) => t.attempt);

  return (
    <div>
      <PortalTitle title="Tests" sub="Take your assigned tests and see your scores." />

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
