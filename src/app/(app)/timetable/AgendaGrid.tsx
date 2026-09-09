import Link from "next/link";
import type { SessionView, WeekDay } from "@/lib/data";

/* Week agenda — the "All" overview. Seven date columns, each a sorted list of
   that day's class chips. No time axis, so dense evenings don't cram and empty
   mornings don't waste space. Clicking a class opens its attendance page. */

export function AgendaGrid({
  sessions,
  dates,
  hueOf,
  today,
}: {
  sessions: SessionView[];
  dates: WeekDay[];
  hueOf: (batchId: string) => number;
  today: string;
}) {
  const byDay = dates.map((d) => ({
    d,
    items: sessions
      .filter((s) => s.date === d.iso)
      .sort((a, b) => a.start.localeCompare(b.start) || a.batchName.localeCompare(b.batchName)),
  }));

  return (
    <div className="mt-4 overflow-x-auto scroll-slim rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid min-w-[760px] grid-cols-7">
        {byDay.map(({ d, items }) => {
          const isToday = d.iso === today;
          return (
            <div key={d.iso} className="border-l border-border first:border-l-0">
              <div
                className={`sticky top-0 z-10 border-b border-border px-2 py-2 text-center ${
                  isToday ? "bg-accent-subtle" : "bg-surface"
                }`}
              >
                <div className="label-mono text-muted-foreground">{d.weekday}</div>
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    isToday ? "text-accent" : "text-foreground"
                  }`}
                >
                  {d.dayNum}
                </div>
              </div>

              <ul className="space-y-1.5 p-1.5">
                {items.map((s) => {
                  const hue = hueOf(s.batch_id);
                  const cancelled = s.status === "cancelled";
                  const style = {
                    background: `hsl(${hue} 70% 96%)`,
                    borderColor: `hsl(${hue} 55% 78%)`,
                    borderLeftColor: `hsl(${hue} 60% 50%)`,
                    color: `hsl(${hue} 45% 26%)`,
                  };
                  const inner = (
                    <>
                      <p className="tabular-nums text-[0.68rem] font-semibold">
                        {s.start}–{s.end}
                      </p>
                      <p className={`truncate text-[0.8rem] font-semibold leading-tight ${cancelled ? "line-through opacity-60" : ""}`}>
                        {s.batchName}
                      </p>
                      <p className="truncate text-[0.68rem]">
                        {s.roomName} · {s.teacherName}
                      </p>
                      {s.status === "extra" ? (
                        <span className="mt-0.5 inline-block rounded bg-accent-subtle px-1 text-[0.6rem] font-semibold text-accent">
                          extra
                        </span>
                      ) : cancelled ? (
                        <span className="mt-0.5 inline-block rounded bg-danger-subtle px-1 text-[0.6rem] font-semibold text-danger">
                          cancelled
                        </span>
                      ) : null}
                    </>
                  );
                  const base = "block overflow-hidden rounded-lg border border-l-[3px] px-2 py-1.5";
                  return (
                    <li key={s.session_id}>
                      {s.projected ? (
                        <div
                          title="Planned — generated closer to the date"
                          className={`${base} border-dashed opacity-75`}
                          style={style}
                        >
                          {inner}
                        </div>
                      ) : (
                        <Link
                          href={`/mark/${s.session_id}`}
                          className={`${base} transition-shadow hover:shadow-[var(--shadow-card)]`}
                          style={style}
                        >
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}

                {items.length === 0 ? (
                  <li className="px-1 py-2 text-center text-[0.7rem] text-muted-foreground/60">—</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
