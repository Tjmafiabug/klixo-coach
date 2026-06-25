"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { CHART, TooltipCard, ChartEmpty } from "./chart-kit";
import { shortDate } from "@/lib/format";

export function AttendanceTrend({
  data,
}: {
  data: { date: string; pct: number; present: number; total: number }[];
}) {
  const reduce = useReducedMotion();
  const gradId = useId().replace(/:/g, "");
  const rows = data.map((d) => ({
    label: shortDate(d.date),
    value: Math.round(d.pct * 100),
    present: d.present,
    total: d.total,
  }));

  if (rows.length < 2) {
    return (
      <ChartEmpty>
        Not enough history yet — mark a few more days to see the trend.
      </ChartEmpty>
    );
  }

  const last = rows[rows.length - 1];
  const summary = `Attendance trend over the last ${rows.length} marked days: from ${rows[0].label} at ${rows[0].value}% to ${last.label} at ${last.value}%.`;

  // Zoom the Y-axis to the data band (floored to a clean 10) so day-to-day
  // variation is visible instead of a flat ribbon hugging 100%.
  const minV = Math.min(...rows.map((r) => r.value));
  const lower = Math.max(0, Math.floor((minV - 5) / 10) * 10);
  const yTicks = [lower, Math.round((lower + 100) / 2), 100];

  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart data={rows} margin={{ left: 4, right: 10, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          tick={{ fill: CHART.axis, fontSize: 11 }}
        />
        <YAxis
          domain={[lower, 100]}
          ticks={yTicks}
          tickFormatter={(v: number) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fill: CHART.axis, fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
          content={(p: unknown) => {
            const tip = p as {
              active?: boolean;
              payload?: {
                payload?: { label: string; value: number; present: number; total: number };
              }[];
            };
            const row = tip.active ? tip.payload?.[0]?.payload : undefined;
            if (!row) return null;
            return (
              <TooltipCard
                title={row.label}
                items={[
                  { label: "Attendance", value: `${row.value}%`, color: CHART.accent },
                  { label: "Present", value: `${row.present}/${row.total}` },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART.accent}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
          isAnimationActive={!reduce}
        />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
