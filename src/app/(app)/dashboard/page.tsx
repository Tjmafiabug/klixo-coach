import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOwnerDashboard } from "@/lib/data";
import { PctBadge, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function DashboardPage() {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");

  const { stats, health } = await getOwnerDashboard();
  const blocking = health.clashes.filter((c) => c.blocking).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Owner dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Attendance across the centre · latest mark per session
      </p>

      <Link
        href="/timetable"
        className={`mt-4 flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
          health.clashes.length === 0
            ? "border-success/20 bg-success-subtle text-success hover:bg-success/10"
            : "border-danger/20 bg-danger-subtle text-danger hover:bg-danger/10"
        }`}
      >
        <span>
          {health.clashes.length === 0
            ? "Schedule health: no clashes"
            : `Schedule health: ${health.clashes.length} clash${health.clashes.length === 1 ? "" : "es"}` +
              (blocking ? ` (${blocking} blocking)` : "")}
        </span>
        <span className="text-xs opacity-80">Timetable →</span>
      </Link>

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
          subtitle={
            stats.recentManual.length < stats.manualCount
              ? `Showing ${stats.recentManual.length} of ${stats.manualCount} · most recent first`
              : `${stats.manualCount} manual marks · most recent first`
          }
        >
          {stats.recentManual.length === 0 ? (
            <Empty>No manual marks recorded.</Empty>
          ) : (
            <ul className="-mx-1 max-h-96 divide-y divide-border overflow-y-auto px-1">
              {stats.recentManual.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {m.studentName}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {m.batchName} · {shortDate(m.date)}
                      <br className="sm:hidden" />
                      <span className="hidden sm:inline"> · </span>
                      marked by {m.markedByName}
                    </p>
                    {m.reason ? (
                      <p className="mt-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-xs italic text-muted-foreground">
                        {m.reason}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0">
                    <StatusPill status={m.status} />
                  </span>
                </li>
              ))}
            </ul>
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
