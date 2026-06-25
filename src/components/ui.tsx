import type { AttendanceStatus } from "@/lib/types";

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: "Present", cls: "bg-success-subtle text-success" },
  absent: { label: "Absent", cls: "bg-danger-subtle text-danger" },
  late: { label: "Late", cls: "bg-warning-subtle text-warning" },
};

export function StatusPill({ status }: { status: AttendanceStatus | string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/** Coloured chip for percentages vs a threshold. */
export function PctBadge({ pct, threshold }: { pct: number; threshold: number }) {
  const v = Math.round(pct * 100);
  const tone =
    v < threshold
      ? "bg-danger-subtle text-danger"
      : v < threshold + 10
        ? "bg-warning-subtle text-warning"
        : "bg-success-subtle text-success";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${tone}`}
    >
      {v}%
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-subtle text-xs font-bold text-brand">
      {initials}
    </span>
  );
}

export function RoleChip({ role }: { role: string }) {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
      {role}
    </span>
  );
}

/** Active / inactive status chip for management lists. */
export function ActiveChip({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${
        active ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/** Tone-coloured notice banner used across the management screens. */
export function Banner({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}) {
  const cls = {
    success: "border-success/20 bg-success-subtle text-success",
    warning: "border-warning/20 bg-warning-subtle text-warning",
    danger: "border-danger/20 bg-danger-subtle text-danger",
    info: "border-border bg-muted text-muted-foreground",
  }[tone];
  return (
    <p className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${cls}`}>
      {children}
    </p>
  );
}

/**
 * Shared input/select styling (matches the timetable rule form).
 * States: default, hover (border), focus (brand ring), disabled (muted +
 * not-allowed), error. Set `aria-invalid` on the field to trigger the error
 * styling — no per-call-site class needed.
 */
export const fieldClass =
  "mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/20";
