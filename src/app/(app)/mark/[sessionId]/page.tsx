import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSessionMeta,
  getRoster,
  getFormOptions,
  effectiveToday,
} from "@/lib/data";
import { getSession } from "@/lib/auth";
import MarkRoster from "./MarkRoster";
import { SessionAdmin } from "./SessionAdmin";

export const dynamic = "force-dynamic";

export default async function MarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { sessionId } = await params;
  const [session, today, sp] = await Promise.all([
    getSessionMeta(sessionId),
    effectiveToday(),
    searchParams,
  ]);
  if (!session) notFound();

  const user = (await getSession())!;
  const isOwner = user.role === "owner";
  const [{ roster, alreadyMarked }, opts] = await Promise.all([
    getRoster(session.batch_id, sessionId, session.date),
    isOwner ? getFormOptions() : Promise.resolve(null),
  ]);

  const isCancelled = session.status === "cancelled";
  const isFuture = session.date > today;
  const isPast = session.date < today;
  const markable = !isCancelled && !isFuture;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href="/today"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 3.5 5.5 8l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </Link>

      <div className="mt-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{session.batchName}</h1>
              {isCancelled ? (
                <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-danger">
                  Cancelled
                </span>
              ) : isPast ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-muted-foreground">
                  Past
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.roomName} · {roster.length} students
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-muted px-3 py-2 text-center">
            <p className="text-sm font-bold tabular-nums">
              {session.start}–{session.end}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">{session.date}</p>
          </div>
        </div>

        {isPast && markable ? (
          <p className="mt-3 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-warning">
            Past session — changes are logged as corrections, with a reason.
          </p>
        ) : null}
      </div>

      {sp.error ? (
        <p className="mt-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">
          {sp.error === "backfill"
            ? "Add a reason for marking this past class."
            : "Add a reason for each changed student."}
        </p>
      ) : null}

      {!markable ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-medium">
            {isCancelled ? "This session is cancelled" : "This session is in the future"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCancelled
              ? "Attendance isn't expected for it."
              : "You can mark it on the day."}
          </p>
        </div>
      ) : roster.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-medium">No active students</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nobody was enrolled in this batch on {session.date}.
          </p>
        </div>
      ) : (
        <MarkRoster
          sessionId={sessionId}
          roster={roster}
          isPast={isPast}
          alreadyMarked={alreadyMarked}
        />
      )}

      {/* cancel / substitute only make sense for today + upcoming, not past or cancelled */}
      {!isPast && !isCancelled ? (
        <SessionAdmin
          sessionId={sessionId}
          isOwner={isOwner}
          currentTeacherId={session.teacher_id}
          teachers={opts?.teachers ?? []}
        />
      ) : null}
    </main>
  );
}
