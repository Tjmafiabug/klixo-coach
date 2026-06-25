import { notFound, redirect } from "next/navigation";
import {
  getSessionMeta,
  getRoster,
  getFormOptions,
  effectiveToday,
} from "@/lib/data";
import { getSession } from "@/lib/auth";
import { Reveal } from "@/components/motion";
import { BackLink } from "@/components/page";
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

  const user = await getSession();
  if (!user) redirect("/login");
  const isOwner = user.role === "owner";
  // a teacher may only open their own (incl. substituted) sessions — no peeking at
  // another teacher's roster (PII) or marking their class by guessing the URL
  if (!isOwner && session.teacher_id !== user.teacherId) notFound();
  const [{ roster, alreadyMarked }, opts] = await Promise.all([
    getRoster(session.batch_id, sessionId, session.date),
    isOwner ? getFormOptions() : Promise.resolve(null),
  ]);

  const isCancelled = session.status === "cancelled";
  const isFuture = session.date > today;
  const isPast = session.date < today;
  const markable = !isCancelled && !isFuture;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <BackLink href="/today">Today</BackLink>

      <Reveal>
        <div className="mt-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight text-foreground">
                  {session.batchName}
                </h2>
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
              <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                {session.start}–{session.end}
              </p>
              <p className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">
                {session.date}
              </p>
            </div>
          </div>

          {isPast && markable ? (
            <p className="mt-3 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-warning">
              Past session — changes are logged as corrections, with a reason.
            </p>
          ) : null}
        </div>
      </Reveal>

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
