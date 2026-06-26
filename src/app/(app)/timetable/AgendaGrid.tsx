import Link from "next/link";
import type { TimetableRuleView } from "@/lib/data";

/* Week agenda — the "All" overview. Seven day columns, each a sorted list of
   class chips. No time axis, so dense evenings don't cram and empty mornings
   don't waste space. Booking happens in the scoped time-grid, not here. */

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function AgendaGrid({
  rules,
  hueOf,
}: {
  rules: TimetableRuleView[];
  hueOf: (batchId: string) => number;
}) {
  const byDay = DAY_ORDER.map((day) => ({
    day,
    items: rules
      .filter((r) => r.days.includes(day))
      .sort((a, b) => toMin(a.start) - toMin(b.start) || a.batchName.localeCompare(b.batchName)),
  }));

  return (
    <div className="mt-4 overflow-x-auto scroll-slim rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid min-w-[760px] grid-cols-7">
        {byDay.map(({ day, items }) => (
          <div key={day} className="border-l border-border first:border-l-0">
            <div className="sticky top-0 z-10 border-b border-border bg-surface px-2 py-2 text-center">
              <span className="label-mono text-muted-foreground">{day}</span>
            </div>

            <ul className="space-y-1.5 p-1.5">
              {items.map((r) => {
                const hue = hueOf(r.batch_id);
                return (
                  <li key={`${r.slot_id}-${day}`}>
                    <Link
                      href={`/timetable/${r.slot_id}`}
                      className="block overflow-hidden rounded-lg border border-l-[3px] px-2 py-1.5 transition-shadow hover:shadow-[var(--shadow-card)]"
                      style={{
                        background: `hsl(${hue} 70% 96%)`,
                        borderColor: `hsl(${hue} 55% 78%)`,
                        borderLeftColor: `hsl(${hue} 60% 50%)`,
                        color: `hsl(${hue} 45% 26%)`,
                      }}
                    >
                      <p className="tabular-nums text-[0.68rem] font-semibold opacity-80">
                        {r.start}–{r.end}
                      </p>
                      <p className="truncate text-[0.8rem] font-semibold leading-tight">
                        {r.batchName}
                      </p>
                      <p className="truncate text-[0.68rem] opacity-70">
                        {r.roomName} · {r.teacherName}
                      </p>
                      {r.effective_to ? (
                        <span className="mt-0.5 inline-block rounded bg-warning-subtle px-1 text-[0.6rem] font-semibold text-warning">
                          until {r.effective_to}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}

              {items.length === 0 ? (
                <li className="px-1 py-2 text-center text-[0.7rem] text-muted-foreground/60">—</li>
              ) : null}

              <li>
                <Link
                  href={`/timetable/new?day=${day}`}
                  className="block rounded-lg border border-dashed border-border px-2 py-1 text-center text-[0.68rem] font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                >
                  + add
                </Link>
              </li>
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
