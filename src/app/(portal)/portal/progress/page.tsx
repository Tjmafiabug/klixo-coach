import { requireStudent } from "@/lib/portal";
import { getStudentProfile, getBatchProgress } from "@/lib/data";
import { Ring, Tile, PortalTitle } from "@/components/portal-ui";
import { OnTrackChip } from "@/components/ui";

export default async function PortalProgress() {
  const { studentId } = await requireStudent();
  const profile = await getStudentProfile(studentId);
  if (!profile) return <p className="text-sm text-muted-foreground">Student not found.</p>;

  const activeBatches = profile.enrollments.filter((e) => e.status === "active" && e.end_date === "");

  // ponytail: one getBatchProgress read-set per active batch. Fine at 1–3 batches
  // per student; if a centre enrolls students in many batches, fold into one
  // batched reader (read Batches/Courses/Chapters/BatchProgress once, map).
  const boards = await Promise.all(activeBatches.map((e) => getBatchProgress(e.batch_id)));

  return (
    <div>
      <PortalTitle title="Syllabus progress" sub="How far each of your classes has covered." />

      {activeBatches.length === 0 ? (
        <Tile>
          <p className="text-sm text-muted-foreground">You&apos;re not enrolled in any active class.</p>
        </Tile>
      ) : (
        <div className="space-y-4">
          {activeBatches.map((e, i) => {
            const b = boards[i];
            const chapters = b?.chapters ?? [];
            const total = chapters.length;
            const done = chapters.filter((c) => c.status === "done").length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Tile key={e.batch_id}>
                <div className="flex items-center gap-4">
                  <Ring pct={pct} tone="warning" label={total ? `${pct}%` : "—"} sub="done" size={104} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{e.batchName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {total ? `${done} of ${total} chapters` : "No syllabus set yet"}
                    </p>
                    {b?.summary?.onTrack != null ? (
                      <span className="mt-2 inline-block">
                        <OnTrackChip onTrack={b.summary.onTrack} />
                      </span>
                    ) : null}
                  </div>
                </div>

                {total > 0 ? (
                  <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
                    {chapters.map((c) => (
                      <li key={c.chapter_id} className="flex items-center gap-2.5 text-sm">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] ${
                            c.status === "done"
                              ? "bg-success-subtle text-success"
                              : c.status === "in_progress"
                                ? "bg-warning-subtle text-warning"
                                : "bg-muted text-muted-foreground"
                          }`}
                          aria-hidden
                        >
                          {c.status === "done" ? "✓" : c.status === "in_progress" ? "•" : "○"}
                        </span>
                        <span className={c.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}>
                          {c.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}
