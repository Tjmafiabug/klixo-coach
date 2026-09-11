import { archiveRows } from "@/lib/archive";
import { archiveCutoff, centreConfig, effectiveToday } from "@/lib/data";
import { reportError } from "@/lib/report-error";

/**
 * Nightly archive sweep (see vercel.json crons).
 *
 * Runs at 01:30, after session generation at 01:00, so the two never delete
 * from Sessions at the same time — both are positional and their windows must
 * not overlap.
 *
 * Moves attendance and sessions older than the retention cutoff out of the hot
 * tabs. Reports what it did; repairs only the one thing it can repair safely
 * (a mis-targeted delete, from a snapshot it still holds). Everything else is
 * left for a human, because the Sheet is the owner's and silently "fixing"
 * their data is how a visible mistake becomes an invisible one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The job is capped per run (ROWS_PER_RUN) so it finishes well inside this,
// but a first run against years of accumulated history is the slow case.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const cutoff = archiveCutoff(await centreConfig(), await effectiveToday());
    const before = (r: { date?: string }) => (r.date ?? "") !== "" && (r.date ?? "") < cutoff;

    // Attendance first: it is 80.6% of payload, so it is the run worth
    // finishing even if the second tab fails.
    const attendance = await archiveRows("Attendance", before);
    const sessions = await archiveRows("Sessions", before);

    const reports = [attendance, sessions];
    for (const r of reports) {
      if (r.copied || r.deleted || r.repaired || r.vanished) {
        console.warn(
          `[cron/archive] ${r.tab}: copied=${r.copied} deleted=${r.deleted} ` +
            `vanished=${r.vanished} repaired=${r.repaired} remaining=${r.remaining}`,
        );
      }
      // A repair means a concurrent edit landed inside the delete window. The
      // rows were put back, but it is the one outcome worth looking at.
      if (r.repaired) {
        console.error(
          `[cron/archive] ${r.tab}: re-appended ${r.repaired} row(s) the delete removed in error`,
        );
      }
    }

    return Response.json({ ok: true, cutoff, reports });
  } catch (err) {
    reportError(err, { scope: "cron/archive" });
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
