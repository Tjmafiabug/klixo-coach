import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDayBoard, effectiveToday } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { runGeneration } from "@/lib/actions";
import { Reveal } from "@/components/motion";
import { TodayDateNav } from "./TodayDateNav";
import { Notice } from "./Notice";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function prettyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{
    marked?: string;
    cancelled?: string;
    added?: string;
    nochange?: string;
    generated?: string;
    removed?: string;
    warn?: string;
    date?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const isOwner = user.role === "owner";
  const [today, sp] = await Promise.all([effectiveToday(), searchParams]);
  // selected date: valid ISO, never in the future
  const date = sp.date && ISO.test(sp.date) && sp.date <= today ? sp.date : today;
  const { sessions, backlog } = await getDayBoard(date, today, user.teacherId, isOwner);

  const isToday = date === today;
  const pending = sessions.filter((s) => !s.marked).length;
  const notice = sp.marked
    ? "Attendance saved."
    : sp.cancelled
      ? "Session cancelled."
      : sp.added
        ? "Extra class added."
        : sp.nochange
          ? "No changes to save."
          : sp.generated !== undefined
            ? `Generated ${sp.generated} session${sp.generated === "1" ? "" : "s"}` +
              (sp.removed && sp.removed !== "0" ? `, removed ${sp.removed}.` : ".")
            : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {isToday ? "Today" : "Sessions"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{prettyDate(date)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sessions.length > 0 && isToday ? (
              <span className="rounded-full bg-brand-subtle px-3 py-1.5 text-sm font-semibold text-brand tabular-nums">
                {pending} to mark
              </span>
            ) : null}
            {isOwner ? (
              <>
                <form action={runGeneration}>
                  <button className="inline-flex items-center rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.98]">
                    Generate
                  </button>
                </form>
                <Link
                  href="/new-session"
                  className="inline-flex items-center gap-1 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground shadow-[var(--shadow-card)] transition-all hover:bg-brand-hover active:scale-[0.98]"
                >
                  + Extra class
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </Reveal>

      <div className="mt-4">
        <TodayDateNav date={date} today={today} />
      </div>

      {notice ? (
        <Notice>
          <CheckIcon /> {notice}
        </Notice>
      ) : null}

      {sp.warn === "student" ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2.5 text-sm font-medium text-warning">
          Heads up: a student in this batch has another class at the same time.
        </p>
      ) : null}

      {backlog.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-warning/25 bg-warning-subtle p-4">
          <p className="text-sm font-semibold text-warning">
            {backlog.length} past session{backlog.length === 1 ? "" : "s"} still unmarked
          </p>
          <ul className="mt-2 divide-y divide-warning/15">
            {backlog.slice(0, 6).map((b) => (
              <li key={b.session_id}>
                <Link
                  href={`/mark/${b.session_id}`}
                  className="flex items-center justify-between gap-3 py-1.5 text-sm transition-colors hover:text-warning"
                >
                  <span className="min-w-0 truncate text-foreground">
                    <span className="font-mono tabular-nums text-muted-foreground">{shortDate(b.date)}</span>
                    {" · "}
                    {b.batchName}
                    <span className="text-muted-foreground"> · {b.start} · {b.rosterSize} students</span>
                  </span>
                  <span className="shrink-0 font-semibold text-warning">Mark →</span>
                </Link>
              </li>
            ))}
          </ul>
          {backlog.length > 6 ? (
            <p className="mt-1.5 text-xs font-medium text-warning/80">
              and {backlog.length - 6} more
            </p>
          ) : null}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-medium text-foreground">No sessions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isToday ? "No scheduled classes today." : `No classes on ${date}.`}
          </p>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s, i) => (
            <Reveal key={s.session_id} delay={Math.min(i * 0.04, 0.3)} as="li" className="h-full">
                <Link
                  href={`/mark/${s.session_id}`}
                  className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-muted py-2 text-center">
                    <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                      {s.start}
                    </span>
                    <span className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">
                      {s.end}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">
                        {s.batchName}
                      </p>
                      {s.source === "adhoc" ? (
                        <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-warning">
                          Extra
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.roomName} · {s.rosterSize} students
                    </p>
                  </div>

                  {s.marked ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success tabular-nums">
                      <CheckIcon /> {s.attendedCount}/{s.rosterSize}
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-foreground transition-colors group-hover:bg-brand-hover">
                      Mark
                    </span>
                  )}
                </Link>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
