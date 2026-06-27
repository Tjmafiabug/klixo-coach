import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStudentProfile,
  batchesForStudent,
  getCenterConfig,
  effectiveToday,
  getStudentFees,
  getStudentPtm,
} from "@/lib/data";
import {
  saveStudent,
  toggleStudentActive,
  addEnrollment,
  endEnrollmentAction,
  recordPaymentAction,
  addChargeAction,
  voidChargeAction,
  voidPaymentAction,
  schedulePtmAction,
  logPtmAction,
  completePtmAction,
  setPtmStatusAction,
} from "@/lib/actions";
import { Banner, fieldClass, textareaClass, ActiveChip, PctBadge, StatusPill, LedgerStatusPill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ExportButton } from "@/components/ExportButton";
import { rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Check the required fields.";
  if (e === "phone") return "Phone numbers must be 6–15 digits.";
  if (e === "dup") return "Already enrolled in that batch.";
  if (e === "range") return "End date can't be before the start date.";
  if (e === "date") return "Enter a valid date.";
  return null;
}

const PTM_MODE_LABEL: Record<string, string> = {
  in_person: "In person",
  call: "Phone call",
  video: "Video call",
};

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    enrolled?: string;
    ended?: string;
    warn?: string;
    paid?: string;
    charged?: string;
    voided?: string;
    pvoided?: string;
    scheduled?: string;
    logged?: string;
    updated?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [profile, candidates, cfg, today, sp, fees, ptm] = await Promise.all([
    getStudentProfile(id),
    batchesForStudent(id),
    getCenterConfig(),
    effectiveToday(),
    searchParams,
    getStudentFees(id),
    getStudentPtm(id),
  ]);
  if (!profile) notFound();
  const { student, enrollments, history, attended, total, pct } = profile;
  const active = student.status === "active";
  const threshold = parseInt(cfg.attendance_threshold, 10) || 75;
  const back = `/manage/students/${id}`;
  const err = errorText(sp.error);
  const scheduledPtm = ptm.filter((p) => p.status === "scheduled");
  const pastPtm = ptm.filter((p) => p.status === "done" || p.status === "no_show");
  const ptmContext = [
    total > 0 ? `${Math.round(pct * 100)}% attd` : null,
    fees.outstanding > 0 ? `${rupees(fees.outstanding)} due` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link href="/manage/students" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Students
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight">{student.name}</h2>
        <ActiveChip active={active} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {student.student_id} · joined {student.join_date}
      </p>

      <div className="mt-4 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.saved ? <Banner tone="success">Student saved.</Banner> : null}
        {sp.enrolled ? <Banner tone="success">Enrolled in batch.</Banner> : null}
        {sp.ended ? <Banner tone="success">Enrollment ended.</Banner> : null}
        {sp.warn === "student" ? (
          <Banner tone="warning">Enrolled despite a timetable clash with another batch.</Banner>
        ) : null}
      </div>

      {/* Attendance summary */}
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div>
          <p className="text-sm font-semibold text-foreground">Attendance</p>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {attended}/{total} attended
          </p>
        </div>
        {total > 0 ? <PctBadge pct={pct} threshold={threshold} /> : (
          <span className="text-sm text-muted-foreground">No marks yet</span>
        )}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      {/* Edit details */}
      <form
        action={saveStudent}
        className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold text-foreground">Details</p>
        <input type="hidden" name="studentId" value={student.student_id} />
        <label className="mt-3 block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" defaultValue={student.name} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Phone</span>
            <input name="phone" inputMode="numeric" defaultValue={student.phone} className={fieldClass} aria-invalid={sp.error === "phone" || undefined} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Parent phone</span>
            <input name="parentPhone" inputMode="numeric" defaultValue={student.parent_phone} className={fieldClass} aria-invalid={sp.error === "phone" || undefined} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Join date</span>
          <input type="date" name="joinDate" defaultValue={student.join_date} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Notes</span>
          <input name="notes" defaultValue={student.notes} className={fieldClass} />
        </label>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <div className="space-y-4">
      {/* Enrollments */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-foreground">Enrollments</p>
        {enrollments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Not enrolled in any batch.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {enrollments.map((e) => {
              const open = e.status === "active" && e.end_date === "";
              return (
                <li
                  key={e.enroll_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{e.batchName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {e.start_date} → {e.end_date || "present"} · {e.end_date ? "ended" : e.status}
                    </p>
                  </div>
                  {open ? (
                    <form action={endEnrollmentAction} className="flex items-end gap-2">
                      <input type="hidden" name="enrollId" value={e.enroll_id} />
                      <input type="hidden" name="back" value={back} />
                      <input
                        type="date"
                        name="endDate"
                        defaultValue={today}
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <button className="h-9 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
                        End
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {candidates.length > 0 ? (
          <form action={addEnrollment} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <input type="hidden" name="studentId" value={student.student_id} />
            <input type="hidden" name="back" value={back} />
            <label className="min-w-[10rem] flex-1">
              <span className="text-xs font-medium">Add to batch</span>
              <select name="batchId" className={`${fieldClass} cursor-pointer`}>
                {candidates.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="w-40">
              <span className="text-xs font-medium">Start date</span>
              <input type="date" name="startDate" defaultValue={today} className={fieldClass} />
            </label>
            <div className="w-28">
              <SubmitButton pendingText="Adding…">Enroll</SubmitButton>
            </div>
          </form>
        ) : null}
      </div>

      {/* Attendance history */}
      {history.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Recent attendance</p>
            <ExportButton kind="student" label="Export CSV" params={{ id: student.student_id }} />
          </div>
          <ul className="mt-3 flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto scroll-slim pr-1">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{h.date}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{h.batchName}</span>
                <span className="flex items-center gap-1.5">
                  {h.method === "manual" ? (
                    <span className="text-[0.7rem] font-semibold uppercase text-muted-foreground">manual</span>
                  ) : null}
                  <StatusPill status={h.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
      </div>

      {/* ---- Fees ledger ---- */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Fees</p>
          <LedgerStatusPill status={fees.status} />
        </div>

        {/* Summary row */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-border bg-surface-2 px-2 py-2.5">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Charged</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">{rupees(fees.charged)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 px-2 py-2.5">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-success">{rupees(fees.paid)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 px-2 py-2.5">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              {fees.outstanding < 0 ? "Credit" : "Outstanding"}
            </p>
            <p
              className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                fees.outstanding > 0
                  ? "text-danger"
                  : fees.outstanding < 0
                    ? "text-brand"
                    : "text-muted-foreground"
              }`}
            >
              {rupees(Math.abs(fees.outstanding))}
            </p>
          </div>
        </div>

        <div className="mt-2 grid items-start gap-x-5 lg:grid-cols-2">
        {/* Record payment form */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record payment</p>
          {sp.paid ? <Banner tone="success">Payment recorded.</Banner> : null}
          <form action={recordPaymentAction} className="mt-3 space-y-3">
            <input type="hidden" name="studentId" value={student.student_id} />
            <input type="hidden" name="back" value={back} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Amount (₹)</span>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  step="1"
                  placeholder="0"
                  className={fieldClass}
                  aria-invalid={sp.error === "amount" || undefined}
                />
                {sp.error === "amount" ? (
                  <p className="mt-1 text-xs text-danger">Enter a whole rupee amount.</p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium">Date</span>
                <input
                  type="date"
                  name="date"
                  defaultValue={today}
                  className={fieldClass}
                  aria-invalid={sp.error === "date" || undefined}
                />
                {sp.error === "date" ? (
                  <p className="mt-1 text-xs text-danger">Enter a valid date.</p>
                ) : null}
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Method</span>
              <select name="method" className={`${fieldClass} cursor-pointer`}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                Note <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="note" placeholder="e.g. June installment" className={fieldClass} />
            </label>
            <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
          </form>
        </div>

        {/* Add charge form */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add charge</p>
          {sp.charged ? <Banner tone="success">Charge added.</Banner> : null}
          {sp.error === "overdiscount" ? (
            <Banner tone="danger">Discount can&apos;t exceed the outstanding balance.</Banner>
          ) : null}
          <form action={addChargeAction} className="mt-3 space-y-3">
            <input type="hidden" name="studentId" value={student.student_id} />
            <input type="hidden" name="back" value={back} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Kind</span>
                <select name="kind" className={`${fieldClass} cursor-pointer`}>
                  <option value="monthly">Monthly fee</option>
                  <option value="admission">Admission</option>
                  <option value="exam">Exam fee</option>
                  <option value="other">Other</option>
                  <option value="discount">Discount</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Amount (₹)</span>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  step="1"
                  placeholder="0"
                  className={fieldClass}
                  aria-invalid={sp.error === "amount" || undefined}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">
                Period <span className="text-muted-foreground">(optional, for monthly)</span>
              </span>
              <input type="month" name="period" className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                Note <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="note" placeholder="e.g. June 2025" className={fieldClass} />
            </label>
            <p className="text-xs text-muted-foreground">
              For discounts, enter the rupee value to deduct — it will be subtracted from the balance.
            </p>
            <SubmitButton pendingText="Adding…">Add charge</SubmitButton>
          </form>
        </div>

        {/* Charges list */}
        {fees.charges.filter((c) => c.status === "active").length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Charges</p>
              {fees.charges.filter((c) => c.status === "void").length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {fees.charges.filter((c) => c.status === "void").length} voided
                </span>
              ) : null}
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {fees.charges
                .filter((c) => c.status === "active")
                .map((c) => (
                  <li
                    key={c.charge_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize text-foreground">
                        {c.kind}
                        {c.period ? ` · ${c.period}` : ""}
                      </p>
                      {c.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{c.note}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{c.created}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                      {rupees(Math.abs(Number(c.amount)))}
                      {Number(c.amount) < 0 ? " off" : ""}
                    </span>
                    <form action={voidChargeAction}>
                      <input type="hidden" name="chargeId" value={c.charge_id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="h-7 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/10">
                        Void
                      </button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {/* Payments list */}
        {fees.payments.filter((p) => p.status === "active").length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {fees.payments
                .filter((p) => p.status === "active")
                .map((p) => (
                  <li
                    key={p.payment_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize text-foreground">
                        {p.method} · {p.date}
                      </p>
                      {p.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.note}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-success">
                      {rupees(Number(p.amount))}
                    </span>
                    <form action={voidPaymentAction}>
                      <input type="hidden" name="paymentId" value={p.payment_id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="h-7 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/10">
                        Void
                      </button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
      </div>

      {/* ---- Parent meetings (PTM) ---- */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Parent meetings</p>
          {ptmContext ? (
            <span className="text-xs text-muted-foreground tabular-nums">{ptmContext}</span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {sp.scheduled ? <Banner tone="success">Meeting scheduled.</Banner> : null}
          {sp.logged ? <Banner tone="success">Meeting logged.</Banner> : null}
          {sp.updated ? <Banner tone="success">Meeting updated.</Banner> : null}
        </div>

        {/* Upcoming (scheduled) */}
        {scheduledPtm.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {scheduledPtm.map((p) => (
                <li key={p.ptm_id} className="rounded-xl border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {p.date} · {PTM_MODE_LABEL[p.mode] ?? p.mode}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <form action={setPtmStatusAction}>
                        <input type="hidden" name="ptmId" value={p.ptm_id} />
                        <input type="hidden" name="status" value="no_show" />
                        <input type="hidden" name="back" value={back} />
                        <button className="h-7 cursor-pointer rounded-lg border border-border px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted">
                          No-show
                        </button>
                      </form>
                      <form action={setPtmStatusAction}>
                        <input type="hidden" name="ptmId" value={p.ptm_id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <input type="hidden" name="back" value={back} />
                        <button className="h-7 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/10">
                          Cancel
                        </button>
                      </form>
                    </div>
                  </div>
                  {p.summary ? <p className="mt-1 text-xs text-muted-foreground">{p.summary}</p> : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-brand">Mark done…</summary>
                    <form action={completePtmAction} className="mt-2 space-y-2">
                      <input type="hidden" name="ptmId" value={p.ptm_id} />
                      <input type="hidden" name="back" value={back} />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs font-medium">Date</span>
                          <input type="date" name="date" defaultValue={p.date} className={fieldClass} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium">Mode</span>
                          <ModeSelect defaultValue={p.mode} />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-xs font-medium">Met with</span>
                        <MetWithSelect />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium">Summary</span>
                        <textarea name="summary" rows={2} className={textareaClass} placeholder="What was discussed, any actions…" />
                      </label>
                      <SubmitButton pendingText="Saving…">Mark done</SubmitButton>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Log + Schedule */}
        <div className="mt-2 grid items-start gap-x-5 lg:grid-cols-2">
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log a meeting</p>
            <form action={logPtmAction} className="mt-3 space-y-3">
              <input type="hidden" name="studentId" value={student.student_id} />
              <input type="hidden" name="back" value={back} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">Date</span>
                  <input type="date" name="date" defaultValue={today} className={fieldClass} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Mode</span>
                  <ModeSelect />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-medium">Met with</span>
                <MetWithSelect />
              </label>
              <label className="block">
                <span className="text-sm font-medium">
                  Summary <span className="text-muted-foreground">(optional)</span>
                </span>
                <textarea name="summary" rows={2} className={textareaClass} placeholder="What was discussed, any actions…" />
              </label>
              <SubmitButton pendingText="Logging…">Log meeting</SubmitButton>
            </form>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule a meeting</p>
            <form action={schedulePtmAction} className="mt-3 space-y-3">
              <input type="hidden" name="studentId" value={student.student_id} />
              <input type="hidden" name="back" value={back} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">Date</span>
                  <input type="date" name="date" defaultValue={today} className={fieldClass} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Mode</span>
                  <ModeSelect />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-medium">
                  Note <span className="text-muted-foreground">(optional)</span>
                </span>
                <input name="summary" className={fieldClass} placeholder="e.g. discuss term results" />
              </label>
              <SubmitButton pendingText="Scheduling…">Schedule</SubmitButton>
            </form>
          </div>
        </div>

        {/* History */}
        {pastPtm.length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {pastPtm.map((p) => (
                <li key={p.ptm_id} className="rounded-xl border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {p.date} · {PTM_MODE_LABEL[p.mode] ?? p.mode}
                      {p.met_with ? <span className="text-muted-foreground"> · {p.met_with}</span> : null}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {p.status === "no_show" ? (
                        <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger">
                          No-show
                        </span>
                      ) : null}
                      <form action={setPtmStatusAction}>
                        <input type="hidden" name="ptmId" value={p.ptm_id} />
                        <input type="hidden" name="status" value="void" />
                        <input type="hidden" name="back" value={back} />
                        <button className="h-7 cursor-pointer rounded-lg border border-border px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger">
                          Void
                        </button>
                      </form>
                    </div>
                  </div>
                  {p.summary ? <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Active toggle */}
      <form action={toggleStudentActive} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <input type="hidden" name="studentId" value={student.student_id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <p className="text-sm font-semibold text-foreground">
          {active ? "Deactivate student" : "Reactivate student"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {active
            ? "Removes them from rosters going forward. History is kept."
            : "Returns them to active rosters."}
        </p>
        <button
          className={`mt-2 h-10 cursor-pointer rounded-lg border px-4 text-sm font-semibold transition-colors ${
            active
              ? "border-danger/30 bg-danger-subtle text-danger hover:bg-danger/10"
              : "border-success/30 bg-success-subtle text-success hover:bg-success/10"
          }`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
      </form>
    </main>
  );
}

function ModeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="mode" defaultValue={defaultValue ?? "in_person"} className={`${fieldClass} cursor-pointer`}>
      <option value="in_person">In person</option>
      <option value="call">Phone call</option>
      <option value="video">Video call</option>
    </select>
  );
}

function MetWithSelect() {
  return (
    <select name="metWith" defaultValue="Mother" className={`${fieldClass} cursor-pointer`}>
      <option>Mother</option>
      <option>Father</option>
      <option>Guardian</option>
      <option>Both parents</option>
      <option>Other</option>
    </select>
  );
}
