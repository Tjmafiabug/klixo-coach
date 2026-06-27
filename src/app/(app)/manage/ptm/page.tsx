import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPtmBoard } from "@/lib/data";
import { shortDate, waLink, paginate } from "@/lib/format";
import { Pager, SearchBox } from "@/components/page";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  in_person: "In person",
  call: "Phone call",
  video: "Video call",
};

const RECENT_PREVIEW = 8;

export default async function PtmPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [{ upcoming, recent, due, intervalDays }, sp] = await Promise.all([
    getPtmBoard(),
    searchParams,
  ]);
  const q = (sp.q ?? "").trim();
  const ql = q.toLowerCase();
  const match = (n: string) => n.toLowerCase().includes(ql);
  const dueF = q ? due.filter((d) => match(d.name)) : due;
  const upcomingF = q ? upcoming.filter((u) => match(u.studentName)) : upcoming;
  const recentF = q ? recent.filter((r) => match(r.studentName)) : recent;
  const duePage = paginate(dueF, Number(sp.page), 12);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Parent meetings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who to meet, what&apos;s booked, and what was discussed. Open a student to schedule or log one.
          </p>
        </div>
        <SearchBox action="/manage/ptm" placeholder="Search by student…" defaultValue={q} />
      </div>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        {/* To meet — risk-ranked */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">To meet</p>
            <span className="text-xs text-muted-foreground">
              no meeting in {intervalDays}d · low attendance · absence streak · fees due
            </span>
          </div>
          {dueF.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {q ? `No flagged students match “${q}”.` : "Everyone’s been met recently — nothing flagged."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {duePage.slice.map((d) => {
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
          <Pager
            page={duePage.page}
            pages={duePage.pages}
            total={duePage.total}
            start={duePage.start}
            size={duePage.size}
            baseHref="/manage/ptm"
            params={{ q: q || undefined }}
          />
        </section>

        {/* Upcoming */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-foreground">Upcoming</p>
          {upcomingF.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {q ? "No scheduled meetings match." : "No meetings scheduled."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {upcomingF.map((u) => {
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
          {recentF.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {q ? "No logged meetings match." : "No meetings logged yet."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {recentF.slice(0, RECENT_PREVIEW).map((r) => (
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
