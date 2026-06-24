import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionMeta, getRoster } from "@/lib/data";
import MarkRoster from "./MarkRoster";

export const dynamic = "force-dynamic";

export default async function MarkPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSessionMeta(sessionId);
  if (!session) notFound();

  const { roster, alreadyMarked } = await getRoster(session.batch_id, sessionId);

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
        Today
      </Link>

      <div className="mt-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{session.batchName}</h1>
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

        {alreadyMarked ? (
          <p className="mt-3 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-warning">
            Already marked — submitting again updates it.
          </p>
        ) : null}
      </div>

      {roster.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-medium">No active students</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nobody is enrolled in this batch yet.
          </p>
        </div>
      ) : (
        <MarkRoster sessionId={sessionId} roster={roster} />
      )}
    </main>
  );
}
