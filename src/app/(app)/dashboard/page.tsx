import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOwnerDashboard, getCurriculumRollup } from "@/lib/data";
import { PctBadge, StatusPill, OnTrackChip } from "@/components/ui";
import { ExportButton } from "@/components/ExportButton";
import { Reveal, CountUp } from "@/components/motion";
import { AttendanceDonut } from "@/components/charts/AttendanceDonut";
import { BatchBarChart } from "@/components/charts/BatchBarChart";
import { AttendanceTrend } from "@/components/charts/AttendanceTrend";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const [{ stats, health, integrity }, rollup] = await Promise.all([
    getOwnerDashboard(),
    getCurriculumRollup(),
  ]);
  const blocking = health.clashes.filter((c) => c.blocking).length;
  const healthy = health.clashes.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* ---- Status row: schedule health + reports ---- */}
      <Reveal>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/timetable"
            className={`group inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              healthy
                ? "border-success/25 bg-success-subtle text-success hover:bg-success/10"
                : "border-danger/25 bg-danger-subtle text-danger hover:bg-danger/10"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${healthy ? "bg-success" : "bg-danger"}`}
            />
            {healthy
              ? "Schedule healthy — no clashes"
              : `${health.clashes.length} clash${health.clashes.length === 1 ? "" : "es"}` +
                (blocking ? ` · ${blocking} blocking` : "")}
            <span className="opacity-60 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline">
              Reports
            </span>
            <ExportButton kind="attendance" label="Attendance log" />
            <ExportButton kind="defaulters" label="Defaulters" />
            <ExportButton kind="batches" label="Batch summary" />
          </div>
        </div>
      </Reveal>

      {integrity.length > 0 ? (
        <Reveal delay={0.05}>
          <div className="mt-4 rounded-2xl border border-warning/25 bg-warning-subtle p-4">
            <p className="text-sm font-semibold text-warning">
              {integrity.length} data integrity issue
              {integrity.length === 1 ? "" : "s"} — likely a direct-Sheet edit
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-warning/90">
              {integrity.slice(0, 6).map((it, i) => (
                <li key={i}>
                  <span className="font-semibold uppercase">{it.kind}</span> ·{" "}
                  {it.detail}
                </li>
              ))}
              {integrity.length > 6 ? (
                <li>…and {integrity.length - 6} more</li>
              ) : null}
            </ul>
          </div>
        </Reveal>
      ) : null}

      {/* ---- KPI strip ---- */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Overall attendance" tone="accent" delay={0.04}>
          <CountUp value={Math.round(stats.overall * 100)} suffix="%" />
        </KpiTile>
        <KpiTile label="Marks recorded" tone="ink" delay={0.08}>
          <CountUp value={stats.totalMarks} locale />
        </KpiTile>
        <KpiTile label="Students tracked" tone="ink" delay={0.12}>
          <CountUp value={stats.studentCount} locale />
        </KpiTile>
        <KpiTile
          label={`Defaulters below ${stats.threshold}%`}
          tone={stats.defaulters.length > 0 ? "danger" : "success"}
          sub={stats.defaulters.length > 0 ? "Need follow-up" : "All clear"}
          delay={0.16}
        >
          <CountUp value={stats.defaulters.length} />
        </KpiTile>
      </div>

      {/* ---- Trend (wide) + Donut (narrow) ---- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.05} className="lg:col-span-2">
          <Card
            title="Attendance trend"
            subtitle="Daily present rate · last 14 marked days"
          >
            <AttendanceTrend data={stats.trend} />
          </Card>
        </Reveal>
        <Reveal delay={0.1}>
          <Card title="Attendance mix" subtitle="Latest mark per session">
            <AttendanceDonut
              present={stats.statusBreakdown.present}
              absent={stats.statusBreakdown.absent}
              late={stats.statusBreakdown.late}
            />
          </Card>
        </Reveal>
      </div>

      {/* ---- Batches + Defaulters ---- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <Card
            title="Attendance by batch"
            subtitle={`Dashed line marks the ${stats.threshold}% minimum`}
          >
            <BatchBarChart data={stats.batchStats} threshold={stats.threshold} />
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card title="Defaulters" subtitle={`Below ${stats.threshold}% attendance`}>
            {stats.defaulters.length === 0 ? (
              <Empty>No defaulters — everyone is above {stats.threshold}%.</Empty>
            ) : (
              <ul className="-mx-1 max-h-[20rem] divide-y divide-border overflow-y-auto px-1 scroll-slim">
                {stats.defaulters.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {d.name}
                      </p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {d.total} sessions
                      </p>
                    </div>
                    <PctBadge pct={d.pct} threshold={stats.threshold} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      {/* ---- Curriculum progress (per-batch pacing rollup) ---- */}
      <Reveal delay={0.05} className="mt-4 block">
        <Card
          title="Curriculum progress"
          subtitle={
            rollup.tracked === 0
              ? "Map a syllabus to a batch to track pacing"
              : rollup.termSet
                ? `${rollup.behind} behind · ${rollup.onTrackCount} on track`
                : `${rollup.tracked} batch${rollup.tracked === 1 ? "" : "es"} tracked · set term dates in Settings to pace`
          }
        >
          {rollup.batches.length === 0 ? (
            <Empty>No active batches.</Empty>
          ) : (
            <ul className="-mx-1 max-h-[26rem] divide-y divide-border overflow-y-auto px-1 scroll-slim">
              {rollup.batches.map((b) => (
                <li key={b.batch_id} className="py-2.5">
                  <Link
                    href={`/manage/batches/${b.batch_id}/progress`}
                    className="group block"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                        {b.name}
                      </p>
                      <OnTrackChip onTrack={b.onTrack} />
                    </div>
                    {b.hasCourse && b.total > 0 ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.round(b.pct * 100)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {b.done}/{b.total}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {b.hasCourse ? "No chapters yet" : "No syllabus mapped"}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>

      {/* ---- Manual-mark audit ---- */}
      <Reveal delay={0.05} className="mt-4 block">
        <Card
          title="Manual-mark audit"
          subtitle={
            stats.recentManual.length < stats.manualCount
              ? `Showing ${stats.recentManual.length} of ${stats.manualCount} · newest first`
              : `${stats.manualCount} manual marks · newest first`
          }
        >
          {stats.recentManual.length === 0 ? (
            <Empty>No manual marks recorded.</Empty>
          ) : (
            <ul className="-mx-1 max-h-[26rem] divide-y divide-border overflow-y-auto px-1 scroll-slim">
              {stats.recentManual.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.studentName}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {m.batchName} · {shortDate(m.date)} · marked by{" "}
                      {m.markedByName}
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
      </Reveal>
    </div>
  );
}

function KpiTile({
  label,
  tone,
  sub,
  delay,
  children,
}: {
  label: string;
  tone: "accent" | "ink" | "danger" | "success";
  sub?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const dot = {
    accent: "bg-accent",
    ink: "bg-foreground",
    danger: "bg-danger",
    success: "bg-success",
  }[tone];
  const text = {
    accent: "text-accent",
    ink: "text-foreground",
    danger: "text-danger",
    success: "text-success",
  }[tone];
  return (
    <Reveal delay={delay} className="h-full">
      <div className="h-full rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        </div>
        <p className={`mt-3 font-mono text-2xl font-bold tabular-nums sm:text-3xl ${text}`}>
          {children}
        </p>
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </div>
    </Reveal>
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
    <section className="h-full rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <h2 className="font-semibold tracking-tight text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-[200px] place-items-center rounded-xl border border-dashed border-border bg-surface-2">
      <p className="px-4 text-center text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
