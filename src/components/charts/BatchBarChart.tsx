"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { CHART, TooltipCard, ChartEmpty, pctColor } from "./chart-kit";

export function BatchBarChart({
  data,
  threshold,
}: {
  data: { id: string; name: string; pct: number; total: number }[];
  threshold: number;
}) {
  const reduce = useReducedMotion();
  // Worst attendance first — this card is an exception-finder, so the batches
  // nearest/below the threshold line should sit at the top, in view.
  const rows = data
    .map((d) => ({ name: d.name, pct: Math.round(d.pct * 100), total: d.total }))
    .sort((a, b) => a.pct - b.pct);

  if (!rows.length) return <ChartEmpty>No batch attendance yet.</ChartEmpty>;

  const height = Math.max(180, rows.length * 46);
  const summary = `Attendance by batch, minimum ${threshold}%: ${rows
    .map((r) => `${r.name} ${r.pct}%`)
    .join("; ")}.`;

  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 0, right: 48, top: 4, bottom: 4 }}
        barCategoryGap={12}
      >
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tickLine={false}
          axisLine={false}
          tick={{ fill: CHART.axis, fontSize: 12 }}
        />
        <ReferenceLine
          x={threshold}
          stroke={CHART.danger}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `min ${threshold}%`,
            position: "top",
            fill: CHART.danger,
            fontSize: 11,
            fontWeight: 600,
          }}
        />
        <Tooltip
          cursor={{ fill: "rgba(10,10,11,0.04)" }}
          content={(p: unknown) => {
            const tip = p as {
              active?: boolean;
              payload?: { payload?: { name: string; pct: number; total: number } }[];
            };
            const row = tip.active ? tip.payload?.[0]?.payload : undefined;
            if (!row) return null;
            return (
              <TooltipCard
                title={row.name}
                items={[
                  { label: "Attendance", value: `${row.pct}%`, color: pctColor(row.pct, threshold) },
                  { label: "Marks", value: row.total.toLocaleString() },
                  { label: "Minimum", value: `${threshold}%`, color: CHART.danger },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="pct"
          radius={[0, 7, 7, 0]}
          barSize={20}
          isAnimationActive={!reduce}
        >
          {rows.map((r) => (
            <Cell key={r.name} fill={pctColor(r.pct, threshold)} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: unknown) => `${v}%`}
            fill={CHART.ink}
            fontSize={12}
            fontWeight={600}
          />
        </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
