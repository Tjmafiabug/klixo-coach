import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getTodaySessions, effectiveToday } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ marked?: string }>;
}) {
  const user = (await getSession())!; // layout already guards
  const [sessions, today, sp] = await Promise.all([
    getTodaySessions(user.teacherId),
    effectiveToday(),
    searchParams,
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Today&rsquo;s sessions</h1>
        <span className="text-sm text-black/50 dark:text-white/50">{today}</span>
      </div>

      {sp.marked ? (
        <p className="mt-3 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Attendance saved for {sp.marked}.
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-black/15 p-8 text-center text-black/50 dark:border-white/20 dark:text-white/50">
          No sessions scheduled for you today.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <Link
                href={`/mark/${s.session_id}`}
                className="flex items-center justify-between rounded-xl border border-black/10 p-4 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-white/15 dark:hover:bg-indigo-500/10"
              >
                <div>
                  <p className="font-semibold">{s.batchName}</p>
                  <p className="mt-0.5 text-sm text-black/55 dark:text-white/55">
                    {s.start}–{s.end} · {s.roomName}
                    {s.source === "adhoc" ? " · extra" : ""}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-medium text-white">
                  Mark
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
