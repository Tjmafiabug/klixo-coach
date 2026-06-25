"use client";

/** Chart colours mirror the globals.css tokens (recharts needs literal values). */
export const CHART = {
  accent: "#2563eb",
  success: "#047857",
  warning: "#b45309",
  danger: "#b91c1c",
  grid: "#eef0f4",
  axis: "#5b6473",
  ink: "#0a0a0b",
} as const;

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
