import { requireStudent } from "@/lib/portal";
import { getStudentProfile, getCenterConfig } from "@/lib/data";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { StatusPill, PctBadge } from "@/components/ui";
import { shortDate, paginate } from "@/lib/format";
import { Pager } from "@/components/page";

export default async function PortalAttendance({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { studentId } = await requireStudent();
  const [profile, cfg, sp] = await Promise.all([
    getStudentProfile(studentId),
    getCenterConfig(),
    searchParams,
  ]);
  if (!profile) return <p className="text-sm text-muted-foreground">Student not found.</p>;
  const threshold = Number(cfg.attendance_threshold) || 75;

  // per-batch rate from history (present + late = attended, matching centre policy)
  const byBatch = new Map<string, { attended: number; total: number }>();
  for (const h of profile.history) {
    const b = byBatch.get(h.batchName) ?? { attended: 0, total: 0 };
    b.total += 1;
    if (h.status === "present" || h.status === "late") b.attended += 1;
    byBatch.set(h.batchName, b);
  }
  const batchRows = [...byBatch.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // A full term is hundreds of rows on a phone. 20 keeps the page short without
  // hiding the recent days a student actually came here to check.
  const historyPage = paginate(profile.history, Number(sp.page), 20);

  return (
    <div>
      <PortalTitle title="Attendance" sub={`Minimum required: ${threshold}%`} />

      {batchRows.length === 0 ? (
        <Tile>
          <p className="text-sm text-muted-foreground">No attendance marked yet.</p>
        </Tile>
      ) : (
        <>
          <Tile className="mb-4">
            <p className="mb-3 text-sm font-semibold text-foreground">By class</p>
            <ul className="space-y-2.5">
              {batchRows.map(([batch, r]) => (
                <li key={batch} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{batch}</p>
                    <p className="text-xs text-muted-foreground">{r.attended}/{r.total} attended</p>
                  </div>
                  <PctBadge pct={r.attended / r.total} threshold={threshold} />
                </li>
              ))}
            </ul>
          </Tile>

          <p className="mb-2 px-1 text-sm font-semibold text-foreground">Recent history</p>
          <ul className="space-y-2">
            {historyPage.slice.map((h, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{shortDate(h.date)}</p>
                  <p className="truncate text-xs text-muted-foreground">{h.batchName}</p>
                </div>
                <StatusPill status={h.status} />
              </li>
            ))}
          </ul>

          <Pager
            page={historyPage.page}
            pages={historyPage.pages}
            total={historyPage.total}
            start={historyPage.start}
            size={historyPage.size}
            baseHref="/portal/attendance"
          />
        </>
      )}
    </div>
  );
}
