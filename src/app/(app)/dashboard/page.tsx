import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOwnerStats } from "@/lib/data";
import { PctBadge, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function DashboardPage() {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");

  const stats = await getOwnerStats();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Owner dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Attendance across the centre · latest mark per session
      </p>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overall attendance" value={pct(stats.overall)} tone="brand" />
        <Stat label="Marks recorded" value={stats.totalMarks.toLocaleString()} />
        <Stat label="Students tracked" value={String(stats.studentCount)} />
        <Stat
          label={`Defaulters <${stats.threshold}%`}
          value={String(stats.defaulters.length)}
          tone={stats.defaulters.length > 0 ? "danger" : "success"}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Attendance by batch">
          <ul className="flex flex-col gap-3">
            {stats.batchStats.map((b) => {
              const v = Math.round(b.pct * 100);
              const bar =
                v < stats.threshold
                  ? "bg-danger"
                  : v < stats.threshold + 10
                    ? "bg-warning"
                    : "bg-success";
              return (
                <li key={b.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{b.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {v}%{" "}
                      <span className="text-xs">({b.total})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${bar}`}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Defaulters"
          subtitle={`Below ${stats.threshold}% attendance`}
        >
          {stats.defaulters.length === 0 ? (
            <Empty>No defaulters — everyone is above {stats.threshold}%.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {stats.defaulters.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {d.total} sessions
                    </p>
                  </div>
                  <PctBadge pct={d.pct} threshold={stats.threshold} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Manual-mark audit"
          subtitle={`${stats.manualCount} manual marks total`}
        >
          {stats.recentManual.length === 0 ? (
            <Empty>No manual marks recorded.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-semibold">Student</th>
                    <th className="pb-2 font-semibold">Batch</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.recentManual.map((m, i) => (
                    <tr key={i}>
                      <td className="py-2 font-medium text-foreground">{m.studentName}</td>
                      <td className="py-2 text-muted-foreground">{m.batch_id}</td>
                      <td className="py-2">
                        <StatusPill status={m.status} />
                      </td>
                      <td className="py-2 tabular-nums text-muted-foreground">{m.date}</td>
                      <td className="py-2 text-muted-foreground">{m.marked_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "danger" | "success";
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : tone === "brand"
          ? "text-brand"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
  );
}
