import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBatchRegister } from "@/lib/data";
import type { RegisterState } from "@/lib/data";
import { PageHeader } from "@/components/page";
import { PctBadge } from "@/components/ui";
import { ExportButton } from "@/components/ExportButton";

export const dynamic = "force-dynamic";

// One glyph + colour per cell state. `unmarked` is the actionable gap; the blank
// states (not-enrolled / upcoming) read as quiet so real marks carry the eye.
const CELL: Record<RegisterState, { ch: string; cls: string; sr: string }> = {
  present: { ch: "P", cls: "bg-success-subtle text-success", sr: "present" },
  late: { ch: "L", cls: "bg-warning-subtle text-warning", sr: "late" },
  absent: { ch: "A", cls: "bg-danger-subtle text-danger", sr: "absent" },
  unmarked: { ch: "·", cls: "bg-muted text-muted-foreground", sr: "not marked" },
  // The glyph carries the meaning, so it has to be readable — /40 renders at
  // 1.69:1. ("not-enrolled" draws no character, so contrast doesn't apply.)
  cancelled: { ch: "✕", cls: "text-muted-foreground", sr: "cancelled" },
  "not-enrolled": { ch: "", cls: "text-muted-foreground/20", sr: "not enrolled" },
  upcoming: { ch: "", cls: "", sr: "upcoming" },
};

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const { id } = await params;
  const sp = await searchParams;
  const reg = await getBatchRegister(id, sp.month ?? "");
  if (!reg) notFound();
  const { batch, month, columns, rows, threshold } = reg;

  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const stick = "sticky bg-surface";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref={`/manage/batches/${id}`}
        backLabel={batch.name}
        title="Attendance register"
        subtitle={`${batch.subject}${batch.level ? ` · ${batch.level}` : ""}`}
      />

      {/* Month nav + export */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/manage/batches/${id}/register?month=${month.prev}`} className={navBtn} aria-label="Previous month">
            ←
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums text-foreground">
            {month.label}
          </span>
          <Link href={`/manage/batches/${id}/register?month=${month.next}`} className={navBtn} aria-label="Next month">
            →
          </Link>
        </div>
        <ExportButton kind="attendance" label="Export CSV" params={{ batch: id }} />
      </div>

      {columns.length === 0 ? (
        <Empty>No sessions for {batch.name} in {month.label}.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No students were enrolled in this batch during {month.label}.</Empty>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] scroll-slim">
            <table className="border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${stick} left-0 z-20 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>
                    Student
                  </th>
                  {columns.map((c) => (
                    <th key={c.session_id} className="px-1 py-1.5">
                      <Link
                        href={`/mark/${c.session_id}`}
                        title={`${c.date} · ${c.start}${c.cancelled ? " · cancelled" : ""} — open to mark`}
                        className={`flex w-9 flex-col items-center rounded-md py-1 transition-colors hover:bg-muted ${c.cancelled ? "line-through opacity-50" : ""}`}
                      >
                        <span className="font-mono text-sm font-bold tabular-nums text-foreground">{c.dayNum}</span>
                        <span className="text-[0.6rem] uppercase text-muted-foreground">{c.weekday}</span>
                      </Link>
                    </th>
                  ))}
                  <th className={`${stick} right-0 z-20 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className="border-b border-border last:border-b-0">
                    <th scope="row" className={`${stick} left-0 z-10 max-w-[12rem] truncate px-3 py-1.5 text-left font-medium text-foreground`}>
                      {r.name}
                      {!r.active ? <span className="ml-1 text-xs font-normal text-muted-foreground">(inactive)</span> : null}
                    </th>
                    {r.states.map((st, i) => {
                      const cell = CELL[st];
                      return (
                        <td key={columns[i].session_id} className="px-1 py-1">
                          <span
                            className={`mx-auto flex h-8 w-8 items-center justify-center rounded text-xs font-bold ${cell.cls}`}
                            title={`${r.name} · ${columns[i].date}: ${cell.sr}`}
                          >
                            {cell.ch}
                          </span>
                        </td>
                      );
                    })}
                    <td className={`${stick} right-0 z-10 px-3 py-1.5 text-right`}>
                      {r.pct === null ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <PctBadge pct={r.pct} threshold={threshold} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <Key cls={CELL.present.cls} ch="P" label="Present" />
            <Key cls={CELL.late.cls} ch="L" label="Late" />
            <Key cls={CELL.absent.cls} ch="A" label="Absent" />
            <Key cls={CELL.unmarked.cls} ch="·" label="Not marked" />
            <span className="text-muted-foreground/70">✕ cancelled · — not enrolled · blank = upcoming</span>
          </div>
        </>
      )}
    </div>
  );
}

function Key({ cls, ch, label }: { cls: string; ch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`flex h-5 w-5 items-center justify-center rounded text-[0.65rem] font-bold ${cls}`}>{ch}</span>
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
