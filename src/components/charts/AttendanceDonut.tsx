"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useReducedMotion } from "framer-motion";
import { CHART, TooltipCard, ChartEmpty } from "./chart-kit";

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
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={(p: unknown) => {
                const tip = p as {
                  active?: boolean;
                  payload?: { name?: string; value?: number }[];
                };
                if (!tip.active || !tip.payload?.length) return null;
                const slice = tip.payload[0];
                const v = slice.value ?? 0;
                return (
                  <TooltipCard
                    title={String(slice.name ?? "")}
                    items={[
                      { label: "Marks", value: v.toLocaleString() },
                      { label: "Share", value: `${Math.round((v / total) * 100)}%` },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-3xl font-bold tabular-nums text-foreground">
              {pct}%
            </p>
            <p className="text-xs font-medium text-muted-foreground">present</p>
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
