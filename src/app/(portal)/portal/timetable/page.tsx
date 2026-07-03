import { requireStudent } from "@/lib/portal";
import { getStudentProfile, getSessionsInRange, effectiveToday, addDays } from "@/lib/data";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { dayLabel } from "@/lib/format";

export default async function PortalTimetable() {
  const { studentId } = await requireStudent();
  const profile = await getStudentProfile(studentId);
  if (!profile) return <p className="text-sm text-muted-foreground">Student not found.</p>;

  const activeBatch = new Set(
    profile.enrollments.filter((e) => e.status === "active" && e.end_date === "").map((e) => e.batch_id),
  );
  const today = await effectiveToday();
  const sessions = (await getSessionsInRange(today, addDays(today, 14)))
    .filter((s) => activeBatch.has(s.batch_id) && (s.status === "scheduled" || s.status === "extra"))
    .filter((s) => s.date >= today);

  // group by date, preserving the already-sorted (date, start) order
  const byDate = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  return (
    <div>
      <PortalTitle title="Timetable" sub="Your classes for the next two weeks." />

      {byDate.size === 0 ? (
        <Tile>
          <p className="text-sm text-muted-foreground">Nothing scheduled in the next two weeks.</p>
        </Tile>
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, rows]) => (
            <div key={date}>
              <p className="mb-2 px-1 text-sm font-semibold text-foreground">
                {dayLabel(date)}
                {date === today ? <span className="ml-2 text-xs font-medium text-brand">Today</span> : null}
              </p>
              <ul className="space-y-2">
                {rows.map((s) => (
                  <li
                    key={s.session_id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
                  >
                    <span className="shrink-0 rounded-lg bg-brand-subtle px-2 py-1 font-mono text-xs font-bold tabular-nums text-brand">
                      {s.start}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.batchName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.start}–{s.end} · {s.roomName}
                        {s.status === "extra" ? " · extra" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
