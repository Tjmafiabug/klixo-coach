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
        className="text-sm text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white"
      >
        ← Today
      </Link>

      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{session.batchName}</h1>
        <span className="text-sm text-black/50 dark:text-white/50">
          {session.start}–{session.end}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-black/55 dark:text-white/55">
        {session.date} · {session.roomName} · {roster.length} students
      </p>

      {alreadyMarked ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          This session already has attendance — submitting will update it.
        </p>
      ) : null}

      {roster.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-black/15 p-8 text-center text-black/50 dark:border-white/20 dark:text-white/50">
          No active students enrolled in this batch.
        </p>
      ) : (
        <div className="mt-4">
          <MarkRoster sessionId={sessionId} roster={roster} />
        </div>
      )}
    </main>
  );
}
