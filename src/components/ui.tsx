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
