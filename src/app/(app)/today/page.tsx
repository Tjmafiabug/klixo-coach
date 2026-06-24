import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSessionsOnDate, effectiveToday } from "@/lib/data";
import { runGeneration } from "@/lib/actions";
import { TodayDateNav } from "./TodayDateNav";

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
  const user = (await getSession())!;
  const isOwner = user.role === "owner";
  const [today, sp] = await Promise.all([effectiveToday(), searchParams]);
  // selected date: valid ISO, never in the future
  const date = sp.date && ISO.test(sp.date) && sp.date <= today ? sp.date : today;
  const sessions = await getSessionsOnDate(date, user.teacherId, isOwner);

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
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isToday ? "Today’s sessions" : "Sessions"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{prettyDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 0 && isToday ? (
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground tabular-nums">
              {pending} to mark
            </span>
          ) : null}
          {isOwner ? (
            <form action={runGeneration}>
              <button className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
                Generate
              </button>
            </form>
          ) : null}
          <Link
            href="/new-session"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            + Extra class
          </Link>
        </div>
      </div>

      <div className="mt-3">
        <TodayDateNav date={date} today={today} />
      </div>

      {notice ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success-subtle px-3 py-2.5 text-sm font-medium text-success">
          <CheckIcon /> {notice}
        </p>
      ) : null}

      {sp.warn === "student" ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2.5 text-sm font-medium text-warning">
          Heads up: a student in this batch has another class at the same time.
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-medium text-foreground">No sessions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isToday ? "No scheduled classes today." : `No classes on ${date}.`}
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <Link
                href={`/mark/${s.session_id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/40 hover:shadow-[var(--shadow-pop)]"
              >
                <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-muted py-2 text-center">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {s.start}
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground tabular-nums">
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
                  <span className="flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success">
                    <CheckIcon /> {s.presentCount}/{s.rosterSize}
                  </span>
                ) : (
                  <span className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors group-hover:bg-brand-hover">
                    Mark
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
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
