import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPtmBoard } from "@/lib/data";
import { shortDate, waLink } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  in_person: "In person",
  call: "Phone call",
  video: "Video call",
};

export default async function PtmPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { upcoming, recent, due, intervalDays } = await getPtmBoard();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h2 className="text-2xl font-bold tracking-tight">Parent meetings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Who to meet, what&apos;s booked, and what was discussed. Open a student to schedule or log one.
      </p>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        {/* To meet — risk-ranked */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">To meet</p>
            <span className="text-xs text-muted-foreground">
              no meeting in {intervalDays}d · low attendance · absence streak · fees due
            </span>
          </div>
          {due.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Everyone&apos;s been met recently — nothing flagged.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {due.map((d) => {
                const wa = waLink(d.parentPhone);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/manage/students/${d.id}`} className="group min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                        {d.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{d.reasons.join(" · ")}</p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-bold tabular-nums text-warning">
                        {d.flags}
                      </span>
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Message ${d.name}'s parent on WhatsApp`}
                          className="rounded-lg border border-success/30 bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10"
                        >
                          Chat
                        </a>
                      ) : null}
                      <Link
                        href={`/manage/students/${d.id}`}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Open
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Upcoming */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-foreground">Upcoming</p>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No meetings scheduled.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {upcoming.map((u) => {
                const wa = waLink(u.parentPhone);
                return (
                  <li
                    key={u.ptm_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <Link href={`/manage/students/${u.studentId}`} className="group min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                        {u.studentName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {shortDate(u.date)} · {MODE_LABEL[u.mode] ?? u.mode}
                      </p>
                    </Link>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Message ${u.studentName}'s parent on WhatsApp`}
                        className="shrink-0 rounded-lg border border-success/30 bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10"
                      >
                        Chat
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-foreground">Recent</p>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No meetings logged yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {recent.map((r) => (
                <li key={r.ptm_id} className="rounded-xl border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/manage/students/${r.studentId}`}
                      className="min-w-0 truncate text-sm font-medium text-foreground hover:text-brand"
                    >
                      {r.studentName}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortDate(r.date)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {MODE_LABEL[r.mode] ?? r.mode}
                    {r.met_with ? ` · ${r.met_with}` : ""}
                    {r.status === "no_show" ? " · no-show" : ""}
                  </p>
                  {r.summary ? <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
