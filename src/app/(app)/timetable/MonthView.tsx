import Link from "next/link";
import type { SessionView, MonthGrid } from "@/lib/data";

/* Month overview. A 6×7 grid; each day cell lists its first few classes (colour
   = batch) and a "+N more" tail. Clicking a day drills into the Day view. */

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({
  sessions,
  month,
  today,
  hueOf,
}: {
  sessions: SessionView[];
  month: MonthGrid;
  today: string;
  hueOf: (batchId: string) => number;
}) {
  const byDate = new Map<string, SessionView[]>();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  for (const arr of byDate.values()) arr.sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="mt-4 overflow-x-auto scroll-slim rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid min-w-[760px] grid-cols-7">
        {DOW.map((d) => (
          <div
            key={d}
            className="label-mono border-b border-l border-border bg-surface px-2 py-2 text-center text-muted-foreground first:border-l-0"
          >
            {d}
          </div>
        ))}

        {month.weeks.flat().map((c) => {
          const items = byDate.get(c.iso) ?? [];
          const isToday = c.iso === today;
          return (
            <Link
              key={c.iso}
              href={`/timetable?view=day&d=${c.iso}`}
              className={`min-h-[104px] border-b border-l border-border p-1.5 transition-colors first:border-l-0 hover:bg-muted ${
                c.inMonth ? "" : "bg-muted/30"
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
                    isToday
                      ? "bg-accent text-accent-foreground"
                      : c.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {c.dayNum}
                </span>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((s) => {
                  const hue = hueOf(s.batch_id);
                  return (
                    <div
                      key={s.session_id}
                      className={`truncate rounded px-1 text-[0.6rem] font-medium leading-tight ${s.status === "cancelled" ? "line-through opacity-60" : ""}`}
                      style={{ background: `hsl(${hue} 70% 95%)`, color: `hsl(${hue} 45% 30%)` }}
                    >
                      <span className="tabular-nums opacity-70">{s.start}</span> {s.batchName}
                    </div>
                  );
                })}
                {items.length > 3 ? (
                  <div className="px-1 text-[0.6rem] text-muted-foreground">
                    +{items.length - 3} more
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
