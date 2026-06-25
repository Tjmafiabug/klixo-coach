"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "framer-motion";
import { CHART, ChartEmpty } from "./chart-kit";

export function AttendanceDonut({
  present,
  absent,
  late,
}: {
  present: number;
  absent: number;
  late: number;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const total = present + absent + late;
  const pct = total ? Math.round((present / total) * 100) : 0;

  const segments = [
    { name: "Present", value: present, color: CHART.success },
    { name: "Late", value: late, color: CHART.warning },
    { name: "Absent", value: absent, color: CHART.danger },
  ];
  const data = segments.filter((d) => d.value > 0);

  if (!total) return <ChartEmpty>No attendance marked yet.</ChartEmpty>;

  const summary = `Attendance mix: ${segments
    .map((s) => `${s.value} ${s.name.toLowerCase()}`)
    .join(", ")} — ${pct}% present.`;

  // Center reflects the hovered slice, or the overall present rate at rest —
  // no floating tooltip, so nothing overlaps the centre label.
  const hovered = active !== null ? data[active] : null;
  const centerValue = hovered
    ? `${Math.round((hovered.value / total) * 100)}%`
    : `${pct}%`;
  const centerLabel = hovered ? hovered.name.toLowerCase() : "present";

  return (
    <div>
      <div className="relative h-[200px]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={92}
              paddingAngle={2}
              cornerRadius={6}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduce}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-3xl font-bold tabular-nums text-foreground">
              {centerValue}
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              {centerLabel}
            </p>
          </div>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-2">
        {segments.map((s) => (
          <li key={s.name} className="rounded-xl bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {s.name}
              </span>
            </span>
            <span className="mt-0.5 block font-mono text-base font-semibold tabular-nums text-foreground">
              {s.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
