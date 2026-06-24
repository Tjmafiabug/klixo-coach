import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOwnerStats } from "@/lib/data";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function DashboardPage() {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");

  const stats = await getOwnerStats();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold">Owner dashboard</h1>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overall attendance" value={pct(stats.overall)} />
        <Stat label="Marks recorded" value={String(stats.totalMarks)} />
        <Stat label="Students tracked" value={String(stats.studentCount)} />
        <Stat
          label={`Defaulters <${stats.threshold}%`}
          value={String(stats.defaulters.length)}
          accent={stats.defaulters.length > 0}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Defaulters (&lt; {stats.threshold}%)
        </h2>
        {stats.defaulters.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">None.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {stats.defaulters.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{d.name}</span>
                <span className="text-sm">
                  <span className="font-semibold text-red-600">{pct(d.pct)}</span>
                  <span className="text-black/45 dark:text-white/45"> · {d.total} sessions</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Attendance by batch
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {stats.batchStats.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-sm">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{ width: pct(b.pct) }}
                />
              </div>
              <span className="w-10 text-right text-sm font-medium">{pct(b.pct)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Manual-mark audit ({stats.manualCount} total)
        </h2>
        {stats.recentManual.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            No manual marks recorded.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/10">
            {stats.recentManual.map((m, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>
                  {m.studentName}{" "}
                  <span className="text-black/45 dark:text-white/45">
                    · {m.batch_id} · {m.status}
                  </span>
                </span>
                <span className="text-black/45 dark:text-white/45">
                  {m.date} · by {m.marked_by}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          accent ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
