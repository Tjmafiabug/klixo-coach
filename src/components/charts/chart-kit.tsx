"use client";

/** Chart colours mirror the globals.css tokens (recharts needs literal values).
 *  Vivid *-solid values (design spec §2.6) — these are graphics, so they carry
 *  more chroma than the AA text tokens. `series` is the ordered categorical set. */
export const CHART = {
  accent: "#4f46e5", // brand indigo (line/area default)
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  grid: "#eef0f4",
  axis: "#5b6473",
  ink: "#0f1115",
  // Ordered categorical palette — AA on white, distinct in b/w print.
  series: [
    "#4f46e5", // indigo
    "#0d9488", // teal
    "#d97706", // amber
    "#e11d48", // rose
    "#0891b2", // cyan
    "#7c3aed", // violet
    "#059669", // emerald
    "#6b7280", // gray (last / other)
  ],
} as const;

/** Attendance bar/segment colour by value vs threshold: below=red, near=amber,
 *  clear=green. Never a flat gray bar. */
export function pctColor(pct: number, threshold: number): string {
  if (pct < threshold) return CHART.danger;
  if (pct < threshold + 10) return CHART.warning;
  return CHART.success;
}

/** Premium tooltip card shared by every chart. */
export function TooltipCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="mb-1.5 text-xs font-semibold text-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            {it.color ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: it.color }}
              />
            ) : null}
            <span>{it.label}</span>
            <span className="ml-auto pl-4 font-mono font-semibold tabular-nums text-foreground">
              {it.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Centered placeholder when a chart has no/too-little data. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-[200px] place-items-center rounded-xl border border-dashed border-border bg-surface-2">
      <p className="max-w-[18rem] px-4 text-center text-sm text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
