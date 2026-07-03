import type { AttendanceStatus } from "@/lib/types";

/** The one pill. Subtle bg + colored text + colored dot (never gray-on-gray).
 *  All status/role/active chips are thin wrappers over this — recolour here,
 *  the whole app updates (per the ponytail audit + design spec §4). */
export type PillTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const TONE: Record<PillTone, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-success-subtle", text: "text-success", dot: "bg-success-solid" },
  warning: { bg: "bg-warning-subtle", text: "text-warning", dot: "bg-warning-solid" },
  danger: { bg: "bg-danger-subtle", text: "text-danger", dot: "bg-danger-solid" },
  info: { bg: "bg-info-subtle", text: "text-info", dot: "bg-info-solid" },
  brand: { bg: "bg-brand-subtle", text: "text-brand", dot: "bg-brand" },
  neutral: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export function Pill({
  tone,
  dot = true,
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-wide ${t.bg} ${t.text}`}
    >
      {dot ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, PillTone> = {
  present: "success",
  absent: "danger",
  late: "warning",
};

export function StatusPill({ status }: { status: AttendanceStatus | string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{status}</Pill>;
}

/** Fee ledger status pill: due, settled, or credit. */
export function LedgerStatusPill({ status }: { status: "due" | "settled" | "credit" }) {
  const tone: PillTone =
    status === "settled" ? "success" : status === "credit" ? "info" : "warning";
  return <Pill tone={tone}>{status}</Pill>;
}

/** Coloured chip for percentages vs a threshold. Number badge — no dot. */
export function PctBadge({ pct, threshold }: { pct: number; threshold: number }) {
  const v = Math.round(pct * 100);
  const t =
    v < threshold ? TONE.danger : v < threshold + 10 ? TONE.warning : TONE.success;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-sm font-bold tabular-nums tracking-tight ${t.bg} ${t.text}`}
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

/** Staff role chip: owner=brand, teacher=info, anything else neutral. */
export function RoleChip({ role }: { role: string }) {
  const tone: PillTone =
    role.toLowerCase() === "owner" ? "brand" : role.toLowerCase() === "teacher" ? "info" : "neutral";
  return (
    <Pill tone={tone} dot={false}>
      {role}
    </Pill>
  );
}

/** Active / inactive status chip for management lists. */
export function ActiveChip({ active }: { active: boolean }) {
  return <Pill tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Pill>;
}

/** Curriculum pacing verdict (P3). Renders nothing when null — i.e. no term
 *  dates set, or a course with no chapters to pace. */
export function OnTrackChip({ onTrack }: { onTrack: boolean | null }) {
  if (onTrack === null) return null;
  return (
    <Pill tone={onTrack ? "success" : "warning"}>{onTrack ? "On track" : "Behind"}</Pill>
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
    danger: "border-danger/20 hazard-edge bg-danger-subtle text-danger",
    info: "border-info/20 bg-info-subtle text-info",
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

/**
 * Multi-line variant of {@link fieldClass} — same look, auto height (no fixed
 * `h-11`, so it doesn't fight the textarea's `rows`). Same focus/error states.
 */
export const textareaClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/20";
