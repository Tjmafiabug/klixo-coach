"use client";

import { useState } from "react";
import { fieldClass } from "@/components/ui";

/**
 * Compact replacement for the tall per-batch bar chart: pick a batch from a
 * dropdown (worst attendance first, so the exceptions surface) and read its
 * rate against the threshold. One readout instead of a 12-bar column.
 */
export function BatchAttendancePicker({
  data,
  threshold,
}: {
  data: { id: string; name: string; pct: number; total: number }[];
  threshold: number;
}) {
  const rows = [...data]
    .map((d) => ({ ...d, p: Math.round(d.pct * 100) }))
    .sort((a, b) => a.p - b.p);
  const [id, setId] = useState(rows[0]?.id ?? "");

  if (!rows.length) {
    return (
      <div className="grid h-[200px] place-items-center rounded-xl border border-dashed border-border bg-surface-2">
        <p className="text-sm text-muted-foreground">No batch attendance yet.</p>
      </div>
    );
  }

  const sel = rows.find((r) => r.id === id) ?? rows[0];
  const below = sel.p < threshold;
  const tone = below
    ? "text-danger"
    : sel.p < threshold + 10
      ? "text-warning"
      : "text-success";
  const fill = below
    ? "bg-hazard"
    : sel.p < threshold + 10
      ? "bg-warning"
      : "bg-success";

  return (
    <div className="flex flex-col gap-4">
      <select
        aria-label="Select batch to inspect"
        value={sel.id}
        onChange={(e) => setId(e.target.value)}
        className={`${fieldClass} mt-0 font-medium`}
      >
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} — {r.p}%
          </option>
        ))}
      </select>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-end justify-between gap-3">
          <p className={`metric font-mono text-4xl font-bold tabular-nums ${tone}`}>
            {sel.p}%
          </p>
          <span className="label-mono text-muted-foreground">
            {sel.total.toLocaleString()} marks
          </span>
        </div>

        {/* Fill bar with a marker at the threshold. */}
        <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${fill}`}
            style={{ width: `${sel.p}%` }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${threshold}%` }}
          />
        </div>

        <p className="mt-2 label-mono text-muted-foreground">
          {below ? `Below ${threshold}% minimum` : `Above ${threshold}% minimum`}
        </p>
      </div>
    </div>
  );
}
