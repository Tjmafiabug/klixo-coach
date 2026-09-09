import { requireStudent } from "@/lib/portal";
import { getStudentFees } from "@/lib/data";
import { mockPayFeesAction } from "@/lib/actions";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { Pill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { rupees, shortDate } from "@/lib/format";
import type { ChargeKind } from "@/lib/types";

const KIND_LABEL: Record<ChargeKind, string> = {
  monthly: "Monthly fee",
  admission: "Admission",
  exam: "Exam fee",
  other: "Other",
  discount: "Discount",
};

export default async function PortalFees({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const { studentId } = await requireStudent();
  const fees = await getStudentFees(studentId);
  const { paid } = await searchParams;

  return (
    <div>
      <PortalTitle title="Fees" sub="What's charged, paid, and due." />

      {paid ? (
        <div className="mb-4 rounded-xl border border-success/20 bg-success-subtle px-4 py-3 text-sm font-medium text-success">
          Payment successful — thank you! Your balance is updated.
        </div>
      ) : null}

      {/* Balance */}
      <Tile className="mb-4 text-center">
        {fees.outstanding > 0 ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-danger">{rupees(fees.outstanding)}</p>
            {/* Online payment is a mock: it credits the ledger without taking
                money, so it only appears on demo deployments. The action refuses
                too — this just avoids showing a button that would error. */}
            {process.env.DEMO_MODE === "1" && (
              <>
                <form action={mockPayFeesAction} className="mt-4">
                  <SubmitButton pendingText="Processing…">Pay {rupees(fees.outstanding)} now</SubmitButton>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">Demo payment · no money is taken</p>
              </>
            )}
          </>
        ) : fees.credit > 0 ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In credit</p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-info">{rupees(fees.credit)}</p>
            <p className="mt-1 text-sm text-muted-foreground">No dues — you&apos;ve paid ahead.</p>
          </>
        ) : (
          <>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-success">All clear ✓</p>
            <p className="mt-1 text-sm text-muted-foreground">No outstanding fees.</p>
          </>
        )}
      </Tile>

      {/* Charges */}
      <p className="mb-2 px-1 text-sm font-semibold text-foreground">Charges</p>
      {fees.charges.length === 0 ? (
        <p className="mb-4 px-1 text-sm text-muted-foreground">No charges yet.</p>
      ) : (
        <ul className="mb-5 space-y-2">
          {fees.charges.map((c) => {
            const amt = Number(c.amount);
            const void_ = c.status !== "active";
            return (
              <li
                key={c.charge_id}
                className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 ${void_ ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {KIND_LABEL[c.kind as ChargeKind] ?? c.kind}
                    {c.period ? <span className="text-muted-foreground"> · {c.period}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {shortDate(c.created)}
                    {c.note ? ` · ${c.note}` : ""}
                    {void_ ? " · voided" : ""}
                  </p>
                </div>
                <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${amt < 0 ? "text-success" : "text-foreground"}`}>
                  {amt < 0 ? `− ${rupees(-amt)}` : rupees(amt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Payments */}
      <p className="mb-2 px-1 text-sm font-semibold text-foreground">Payments</p>
      {fees.payments.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {fees.payments.map((p) => {
            const void_ = p.status !== "active";
            return (
              <li
                key={p.payment_id}
                className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 ${void_ ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{shortDate(p.date)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Pill tone={void_ ? "neutral" : "success"} dot={!void_}>{p.method}</Pill>
                    {p.note ? <span className="truncate">{p.note}</span> : null}
                    {void_ ? "voided" : null}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-success">{rupees(p.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
