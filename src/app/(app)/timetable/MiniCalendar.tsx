import Link from "next/link";
import type { MonthGrid } from "@/lib/data";

/* Month date-picker for the calendar left rail. Each date links to its week
   (?week=<Monday>); today is filled, the selected week is tinted. */

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const chev =
  "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted";

export function MiniCalendar({
  month,
  weekStart,
  today,
  prevHref,
  nextHref,
}: {
  month: MonthGrid;
  weekStart: string;
  today: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center justify-between">
        <Link href={prevHref} aria-label="Previous month" className={chev}>
          ‹
        </Link>
        <span className="text-sm font-semibold">{month.label}</span>
        <Link href={nextHref} aria-label="Next month" className={chev}>
          ›
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d, i) => (
          <div key={i} className="label-mono pb-1 text-center text-muted-foreground">
            {d}
          </div>
        ))}
        {month.weeks.flat().map((c) => {
          const isToday = c.iso === today;
          const inWeek = c.weekStart === weekStart;
          return (
            <Link
              key={c.iso}
              href={`/timetable?week=${c.weekStart}`}
              className={`flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors ${
                isToday
                  ? "bg-accent font-semibold text-accent-foreground"
                  : inWeek
                    ? "bg-accent-subtle font-medium text-accent"
                    : c.inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/40 hover:bg-muted"
              }`}
            >
              {c.dayNum}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
