import Link from "next/link";
import { requireStudent } from "@/lib/portal";
import {
  getStudentProfile,
  getStudentFees,
  getSessionsInRange,
  getCenterConfig,
  effectiveToday,
  addDays,
} from "@/lib/data";
import { Ring, Tile, PortalTitle } from "@/components/portal-ui";
import { rupees, dayLabel } from "@/lib/format";
import { Verdict, StreakSpark } from "./Verdict";

export default async function PortalHome() {
  const { studentId, name } = await requireStudent();
  const [profile, fees, cfg, today] = await Promise.all([
    getStudentProfile(studentId),
    getStudentFees(studentId),
    getCenterConfig(),
    effectiveToday(),
  ]);
  if (!profile) return <p className="text-sm text-muted-foreground">Student not found.</p>;

  const threshold = Number(cfg.attendance_threshold) || 75;
  const pct = Math.round(profile.pct * 100);
  const attnTone = profile.total === 0 ? "brand" : pct < threshold ? "danger" : pct < threshold + 10 ? "warning" : "success";

  // next class: earliest upcoming session across the student's currently-active batches
  const activeBatch = new Set(
    profile.enrollments.filter((e) => e.status === "active" && e.end_date === "").map((e) => e.batch_id),
  );
  const upcoming = (await getSessionsInRange(today, addDays(today, 14)))
    .filter((s) => activeBatch.has(s.batch_id) && (s.status === "scheduled" || s.status === "extra"))
    .filter((s) => s.date >= today);
  const next = upcoming[0];

  // Current run of attended sessions. history is newest-first, so the streak is
  // the length of the attended prefix — late counts as attended, matching the
  // centre policy the percentage already uses.
  let streak = 0;
  for (const h of profile.history) {
    if (h.status !== "present" && h.status !== "late") break;
    streak += 1;
  }
  // getStudentProfile caps history at 100 rows, so a run that reaches the end of
  // it is "at least this long" — say so rather than assert a number the data
  // cannot support.
  const streakCapped = streak === profile.history.length && streak === 100;

  // What the number means, so a student doesn't have to compare it themselves.
  const verdict =
    profile.total === 0
      ? "Nothing marked yet."
      : pct < threshold
        ? `Below the ${threshold}% minimum — talk to your teacher.`
        : pct < threshold + 10
          ? `Just above the ${threshold}% minimum — don't miss many more.`
          : `Comfortably above the ${threshold}% minimum.`;

  const firstName = name.split(" ")[0];

  return (
    <div>
      <PortalTitle title={`Hi, ${firstName}`} sub="Your attendance, fees and syllabus at a glance." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Attendance */}
        <Tile href="/portal/attendance" className="flex items-center gap-4">
          <Ring
            pct={pct}
            tone={attnTone}
            label={profile.total ? `${pct}%` : "—"}
            sub="present"
            size={104}
          />
          <div>
            <p className="text-sm font-semibold text-foreground">Attendance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile.total ? `${profile.attended}/${profile.total} sessions` : "No sessions yet"}
            </p>
            <Verdict text={verdict} />
            {/* 3 is where a run starts feeling like one worth keeping — but
                never celebrate while the verdict says they are below the
                minimum, which would undercut the thing they need to read. */}
            {streak >= 3 && pct >= threshold ? (
              <StreakSpark days={streak} capped={streakCapped} />
            ) : null}
          </div>
        </Tile>

        {/* Fees */}
        <Tile href="/portal/fees" className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-foreground">Fees</p>
          {fees.outstanding > 0 ? (
            <>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-danger">{rupees(fees.outstanding)}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">outstanding — tap to pay</p>
            </>
          ) : fees.credit > 0 ? (
            <>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-info">{rupees(fees.credit)}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">in credit</p>
            </>
          ) : (
            <>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-success">{rupees(0)}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">all clear ✓</p>
            </>
          )}
        </Tile>
      </div>

      {/* Next class */}
      <Tile href="/portal/timetable" className="mt-3 flex items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 1.8" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Next class</p>
          {next ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{next.batchName}</span> · {dayLabel(next.date)} ·{" "}
              {next.start}–{next.end} · {next.roomName}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">Nothing scheduled in the next two weeks.</p>
          )}
        </div>
      </Tile>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Tile href="/portal/progress" className="text-center">
          <p className="text-sm font-semibold text-foreground">Syllabus</p>
          <p className="mt-1 text-xs text-muted-foreground">See how far each class has covered.</p>
        </Tile>
        <Tile href="/portal/tests" className="text-center">
          <p className="text-sm font-semibold text-foreground">Tests</p>
          <p className="mt-1 text-xs text-muted-foreground">Take tests and see your scores.</p>
        </Tile>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Questions? <Link href="/portal/profile" className="font-medium text-brand">View your profile</Link>
      </p>
    </div>
  );
}
