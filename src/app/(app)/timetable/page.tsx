import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimetableView } from "@/lib/data";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; expired?: string; warn?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [{ rules, clashes }, sp] = await Promise.all([
    getTimetableView(),
    searchParams,
  ]);

  const notice = sp.saved ? "Timetable saved." : sp.expired ? "Rule expired." : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Timetable"
        subtitle={`Weekly recurring rules · ${rules.length} slots`}
        actions={<PrimaryLink href="/timetable/new">+ Add rule</PrimaryLink>}
      />

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

      <Reveal delay={0.05}>
        {clashes.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-subtle p-4">
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
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/25 bg-success-subtle px-4 py-2 text-sm font-medium text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            No clashes — schedule is healthy.
          </p>
        )}
      </Reveal>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((r, i) => (
          <Reveal key={r.slot_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
            <li className="h-full">
              <Link
                href={`/timetable/${r.slot_id}`}
                className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{r.batchName}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                    {r.start}–{r.end} · {r.roomName} · {r.teacherName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.days.map((d) => (
                      <span
                        key={d}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-semibold text-muted-foreground"
                      >
                        {d}
                      </span>
                    ))}
                    {r.effective_to ? (
                      <span className="rounded-md bg-warning-subtle px-1.5 py-0.5 text-[0.7rem] font-semibold text-warning">
                        until {r.effective_to}
                      </span>
                    ) : null}
                  </div>
                </div>
                <RowChevron />
              </Link>
            </li>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
