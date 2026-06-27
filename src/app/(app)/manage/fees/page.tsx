import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listFeesOverview, currentPeriod } from "@/lib/data";
import {
  generateMonthlyChargesAction,
} from "@/lib/actions";
import { paginate } from "@/lib/format";
import { Banner, fieldClass, LedgerStatusPill } from "@/components/ui";
import { PageHeader, Pager } from "@/components/page";
import { ExportButton } from "@/components/ExportButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Reveal, CountUp } from "@/components/motion";
import { rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    generated?: string;
    period?: string;
    paid?: string;
    charged?: string;
    voided?: string;
    pvoided?: string;
    page?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const sp = await searchParams;
  const [overview, current] = await Promise.all([
    listFeesOverview(sp.period),
    currentPeriod(),
  ]);

  const {
    rows,
    totalOutstanding,
    totalCredit,
    studentsWithDues,
    collectedThisPeriod,
    expectedThisPeriod,
    studentsWithDuesPeriod,
    chargedThisPeriod,
    badCells,
    period,
  } = overview;

  const periodOutstanding = expectedThisPeriod - collectedThisPeriod;
  const dues = rows.filter((r) => r.outstanding !== 0);
  const duesPage = paginate(dues, Number(sp.page));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Fees"
        subtitle={
          totalOutstanding > 0
            ? `${rupees(totalOutstanding)} outstanding · ${studentsWithDues} student${studentsWithDues === 1 ? "" : "s"} with dues`
            : totalCredit > 0
              ? `All clear · ${rupees(totalCredit)} credit on account`
              : "No outstanding fees"
        }
        actions={<ExportButton kind="fees" label="Outstanding CSV" />}
      />

      {/* ---- Banners ---- */}
      <div className="mt-4 space-y-3">
        {sp.generated !== undefined ? (
          <Banner tone="success">
            {Number(sp.generated) === 0
              ? "No new charges — all active enrollments already billed for this month."
              : `Generated ${sp.generated} charge${Number(sp.generated) === 1 ? "" : "s"} for ${sp.period ?? current}.`}
          </Banner>
        ) : null}
        {sp.error === "period" ? (
          <Banner tone="danger">Invalid month — pick a valid YYYY-MM period.</Banner>
        ) : null}
        {sp.paid ? <Banner tone="success">Payment recorded.</Banner> : null}
        {sp.charged ? <Banner tone="success">Charge added.</Banner> : null}
        {sp.voided ? <Banner tone="info">Charge voided.</Banner> : null}
        {sp.pvoided ? <Banner tone="info">Payment voided.</Banner> : null}
        {badCells > 0 ? (
          <Banner tone="warning">
            {badCells} malformed cell{badCells === 1 ? "" : "s"} found in the Sheet — amounts may be incorrect. Fix them directly in FeeCharges/Payments tabs.
          </Banner>
        ) : null}
      </div>

      {/* ---- KPI strip ---- */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Total expected" tone="ink" delay={0.04}>
          <span className="font-mono tabular-nums">{rupees(expectedThisPeriod)}</span>
        </KpiTile>
        <KpiTile label="Collected this month" tone="success" delay={0.08}>
          <span className="font-mono tabular-nums">{rupees(collectedThisPeriod)}</span>
        </KpiTile>
        <KpiTile
          label="Total outstanding"
          tone={periodOutstanding > 0 ? "danger" : "success"}
          delay={0.12}
        >
          <span className="font-mono tabular-nums">{rupees(Math.max(0, periodOutstanding))}</span>
        </KpiTile>
        <KpiTile label="Students with dues" tone="ink" delay={0.16}>
          <CountUp value={studentsWithDuesPeriod} />
        </KpiTile>
        <KpiTile label="Charged this month" tone="ink" delay={0.20}>
          <span className="font-mono tabular-nums">{rupees(chargedThisPeriod)}</span>
        </KpiTile>
      </div>

      {/* ---- Generate monthly charges ---- */}
      <Reveal delay={0.05} className="mt-4 block">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold tracking-tight text-foreground">Generate monthly charges</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Creates one bill per active enrollment for the month (idempotent).
          </p>
          <form action={generateMonthlyChargesAction} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[10rem] flex-1">
              <span className="text-sm font-medium">Month</span>
              <input
                type="month"
                name="period"
                defaultValue={sp.period ?? current}
                className={fieldClass}
              />
            </label>
            <div className="w-40">
              <SubmitButton pendingText="Generating…">Generate charges</SubmitButton>
            </div>
          </form>
        </section>
      </Reveal>

      {/* ---- Outstanding by student ---- */}
      <Reveal delay={0.08} className="mt-4 block">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 font-semibold tracking-tight text-foreground">
            Outstanding by student
          </h2>
          {dues.length === 0 ? (
            <div className="grid h-[160px] place-items-center rounded-xl border border-dashed border-border bg-surface-2">
              <p className="px-4 text-center text-sm text-muted-foreground">
                No outstanding balances for {period}.
              </p>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {duesPage.slice.map((r) => (
                  <li key={r.student_id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3">
                    <Link
                      href={`/manage/students/${r.student_id}`}
                      className="group min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                        {r.name}
                      </p>
                      {r.oldestDue ? (
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          Oldest due: {r.oldestDue}
                        </p>
                      ) : null}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <LedgerStatusPill status={r.status} />
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          r.outstanding > 0 ? "text-danger" : "text-brand"
                        }`}
                      >
                        {rupees(Math.abs(r.outstanding))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <Pager
                page={duesPage.page}
                pages={duesPage.pages}
                total={duesPage.total}
                start={duesPage.start}
                size={duesPage.size}
                baseHref="/manage/fees"
                params={{ period: sp.period }}
              />
            </>
          )}
        </section>
      </Reveal>
    </div>
  );
}

function KpiTile({
  label,
  tone,
  delay,
  children,
}: {
  label: string;
  tone: "accent" | "ink" | "danger" | "success";
  delay?: number;
  children: React.ReactNode;
}) {
  const dot = {
    accent: "bg-accent",
    ink: "bg-foreground",
    danger: "bg-hazard",
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
          <p className="label-mono text-muted-foreground">{label}</p>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        </div>
        <p className={`metric mt-3 font-mono text-2xl font-bold tabular-nums sm:text-3xl ${text}`}>
          {children}
        </p>
      </div>
    </Reveal>
  );
}
