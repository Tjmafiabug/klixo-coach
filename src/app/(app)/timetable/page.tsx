import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimetableView } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; expired?: string; warn?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [{ rules, clashes }, sp] = await Promise.all([
    getTimetableView(),
    searchParams,
  ]);

  const notice = sp.saved ? "Timetable saved." : sp.expired ? "Rule expired." : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly recurring rules · {rules.length} slots
          </p>
        </div>
        <Link
          href="/timetable/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          + Add rule
        </Link>
      </div>

      {notice ? (
        <p className="mt-4 rounded-xl border border-success/20 bg-success-subtle px-3 py-2.5 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {sp.warn === "student" ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2.5 text-sm font-medium text-warning">
          Saved with a student clash (two classes overlap for some students).
        </p>
      ) : null}

      {clashes.length > 0 ? (
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger-subtle p-3">
          <p className="text-sm font-semibold text-danger">
            {clashes.length} schedule clash{clashes.length === 1 ? "" : "es"} detected
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-danger/90">
            {clashes.slice(0, 6).map((c, i) => (
              <li key={i}>
                <span className="font-semibold uppercase">{c.type}</span> · {c.date}: {c.a} ↔ {c.b}
              </li>
            ))}
            {clashes.length > 6 ? <li>…and {clashes.length - 6} more</li> : null}
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-success/20 bg-success-subtle px-3 py-2 text-sm font-medium text-success">
          No clashes — schedule is healthy.
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-2.5">
        {rules.map((r) => (
          <li key={r.slot_id}>
            <Link
              href={`/timetable/${r.slot_id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{r.batchName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                  {r.start}–{r.end} · {r.roomName} · {r.teacherName}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.days.map((d) => (
                    <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                      {d}
                    </span>
                  ))}
                  {r.effective_to ? (
                    <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-[0.7rem] font-semibold text-warning">
                      until {r.effective_to}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium text-brand">Edit</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
