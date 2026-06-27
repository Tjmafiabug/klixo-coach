import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPayrollBoard } from "@/lib/data";
import { rupees } from "@/lib/format";
import { PageHeader, RowChevron, MonthNav } from "@/components/page";
import { LedgerStatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sp = await searchParams;
  const board = await getPayrollBoard(sp.month ?? "");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage/staff"
        backLabel="Staff"
        title="Payroll"
        subtitle={`${rupees(board.totals.due)} due this month`}
      />

      <div className="mt-4 flex justify-center">
        <MonthNav
          label={board.label}
          prevHref={`/manage/staff/payroll?month=${board.prev}`}
          nextHref={`/manage/staff/payroll?month=${board.next}`}
        />
      </div>

      {/* totals */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Payroll", val: board.totals.base + board.totals.adjustments },
          { label: "Paid", val: board.totals.paid },
          { label: "Due", val: board.totals.due },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-surface p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-foreground">{rupees(t.val)}</p>
          </div>
        ))}
      </div>

      {board.rows.length === 0 ? (
        <div className="mt-6 grid h-[140px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">No active staff.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {board.rows.map((r) => (
            <li key={r.staff_id}>
              <Link
                href={`/manage/staff/payroll/${r.staff_id}?month=${board.month}`}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{r.name}</p>
                    <LedgerStatusPill status={r.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                    {rupees(r.base)} base
                    {r.adjustments ? ` · ${r.adjustments > 0 ? "+" : ""}${rupees(r.adjustments)} adj` : ""}
                    {" · "}
                    {rupees(r.paid)} paid
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">due</p>
                  <p className="font-semibold tabular-nums text-foreground">{rupees(Math.max(0, r.due))}</p>
                </div>
                <RowChevron />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
