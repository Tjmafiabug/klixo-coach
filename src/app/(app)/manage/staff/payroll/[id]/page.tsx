import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStaffPayroll, FEE_METHODS } from "@/lib/data";
import { rupees, shortDate } from "@/lib/format";
import { paySalary, adjustSalary, voidSalaryItem } from "@/lib/actions";
import { PageHeader, MonthNav } from "@/components/page";
import { Banner, fieldClass, LedgerStatusPill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function StaffPayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getStaffPayroll(id, sp.month ?? "");
  if (!d) notFound();

  const back = `/manage/staff/payroll/${id}?month=${d.month}`;
  const payPrefill = d.due > 0 ? String(d.due) : "";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <PageHeader backHref={`/manage/staff/payroll?month=${d.month}`} backLabel="Payroll" title={d.staff.name} />

      <div className="mt-3 flex justify-center">
        <MonthNav
          label={d.label}
          prev={d.prev}
          next={d.next}
          hrefFor={(m) => `/manage/staff/payroll/${id}?month=${m}`}
        />
      </div>

      {sp.saved ? <div className="mt-4"><Banner tone="success">Saved.</Banner></div> : null}
      {sp.error === "amount" ? <div className="mt-4"><Banner tone="danger">Enter a whole amount greater than 0.</Banner></div> : null}

      {/* summary */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Base salary</span>
          <span className="font-medium tabular-nums text-foreground">{rupees(d.base)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Adjustments</span>
          <span className="font-medium tabular-nums text-foreground">
            {d.adjTotal > 0 ? "+" : ""}{rupees(d.adjTotal)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Paid</span>
          <span className="font-medium tabular-nums text-foreground">{rupees(d.paid)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-foreground">Due</span>
          <span className="flex items-center gap-2">
            <LedgerStatusPill status={d.status} />
            <span className="font-bold tabular-nums text-foreground">{rupees(Math.max(0, d.due))}</span>
          </span>
        </div>
      </div>

      {/* record payment */}
      <form action={paySalary} className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-foreground">Record payment</p>
        <input type="hidden" name="staffId" value={id} />
        <input type="hidden" name="period" value={d.month} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Amount (₹)</span>
            <input name="amount" inputMode="numeric" defaultValue={payPrefill} placeholder="0" className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Method</span>
            <select name="method" defaultValue="cash" className={`${fieldClass} cursor-pointer`}>
              {FEE_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted-foreground">Note <span className="text-muted-foreground/70">(optional)</span></span>
          <input name="note" className={fieldClass} />
        </label>
        <div className="mt-3"><SubmitButton pendingText="Saving…">Record payment</SubmitButton></div>
      </form>

      {/* add adjustment */}
      <form action={adjustSalary} className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-foreground">Add adjustment</p>
        <input type="hidden" name="staffId" value={id} />
        <input type="hidden" name="period" value={d.month} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Kind</span>
            <select name="kind" defaultValue="bonus" className={`${fieldClass} cursor-pointer`}>
              <option value="bonus">Bonus (+)</option>
              <option value="deduction">Deduction (−)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Amount (₹)</span>
            <input name="amount" inputMode="numeric" placeholder="0" className={fieldClass} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted-foreground">Note <span className="text-muted-foreground/70">(optional)</span></span>
          <input name="note" className={fieldClass} />
        </label>
        <div className="mt-3"><SubmitButton pendingText="Saving…">Add adjustment</SubmitButton></div>
      </form>

      {/* ledger: payments */}
      <Ledger title="Payments" empty="No payments this month." count={d.payments.length}>
        {d.payments.map((p) => (
          <LedgerItem
            key={p.pay_id}
            voided={p.status !== "active"}
            main={rupees(p.amount)}
            sub={`${p.method} · ${shortDate(p.date)}${p.note ? ` · ${p.note}` : ""}`}
            voidKind="payment"
            voidId={p.pay_id}
            back={back}
          />
        ))}
      </Ledger>

      {/* ledger: adjustments */}
      <Ledger title="Adjustments" empty="No adjustments this month." count={d.adjustments.length}>
        {d.adjustments.map((a) => (
          <LedgerItem
            key={a.adj_id}
            voided={a.status !== "active"}
            main={`${Number(a.amount) > 0 ? "+" : ""}${rupees(a.amount)}`}
            sub={`${a.kind}${a.note ? ` · ${a.note}` : ""}`}
            voidKind="adjustment"
            voidId={a.adj_id}
            back={back}
          />
        ))}
      </Ledger>
    </main>
  );
}

function Ledger({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {count > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">{children}</ul>
      ) : (
        <p className="mt-2 rounded-xl border border-dashed border-border bg-surface-2 px-3 py-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function LedgerItem({
  voided,
  main,
  sub,
  voidKind,
  voidId,
  back,
}: {
  voided: boolean;
  main: string;
  sub: string;
  voidKind: "payment" | "adjustment";
  voidId: string;
  back: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className={`text-sm font-medium tabular-nums ${voided ? "text-muted-foreground line-through" : "text-foreground"}`}>{main}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}{voided ? " · void" : ""}</p>
      </div>
      {!voided ? (
        <form action={voidSalaryItem}>
          <input type="hidden" name="kind" value={voidKind} />
          <input type="hidden" name="id" value={voidId} />
          <input type="hidden" name="back" value={back} />
          <button className="h-8 cursor-pointer rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted">
            Void
          </button>
        </form>
      ) : null}
    </li>
  );
}
