import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getTimetableView,
  getWeekSessions,
  weekStartOf,
  weekDays,
  addDays,
  effectiveToday,
} from "@/lib/data";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink } from "@/components/page";
import { TimetableView } from "./TimetableView";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; expired?: string; warn?: string; week?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const sp = await searchParams;
  const today = await effectiveToday();
  const weekStart = weekStartOf(isISO(sp.week) ? sp.week! : today);
  const dates = weekDays(weekStart);
  const [{ clashes }, sessions] = await Promise.all([
    getTimetableView(),
    getWeekSessions(weekStart),
  ]);

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const thisWeek = weekStartOf(today);
  const label = `${fmt(dates[0].iso)} – ${fmt(dates[6].iso)}, ${dates[6].iso.slice(0, 4)}`;

  const notice = sp.saved ? "Timetable saved." : sp.expired ? "Rule expired." : null;
  const navBtn =
    "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-muted";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Timetable"
        subtitle="Weekly class calendar"
        actions={<PrimaryLink href="/timetable/new">+ Add rule</PrimaryLink>}
      />

      {notice ? (
        <p className="mt-4 rounded-xl border border-success/20 bg-success-subtle px-3 py-2.5 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {sp.warn === "student" ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2.5 text-sm font-medium text-warning">
          Saved with a student clash (two classes overlap for some students).
        </p>
      ) : null}

      {clashes.length > 0 ? (
        <Reveal delay={0.05}>
          <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-subtle p-4">
            <p className="text-sm font-semibold text-danger">
              {clashes.length} schedule clash{clashes.length === 1 ? "" : "es"} detected
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-danger/90">
              {clashes.slice(0, 6).map((c, i) => (
                <li key={i}>
                  <span className="font-semibold uppercase">{c.type}</span> · {c.date}: {c.a} ↔ {c.b}
                </li>
              ))}
              {clashes.length > 6 ? <li>…and {clashes.length - 6} more</li> : null}
            </ul>
          </div>
        </Reveal>
      ) : null}

      {/* Week navigation */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={`/timetable?week=${prevWeek}`} className={navBtn} aria-label="Previous week">
          ‹
        </Link>
        <Link href={`/timetable?week=${nextWeek}`} className={navBtn} aria-label="Next week">
          ›
        </Link>
        {weekStart !== thisWeek ? (
          <Link href="/timetable" className={navBtn}>
            Today
          </Link>
        ) : null}
        <span className="ml-1 text-sm font-semibold tabular-nums">{label}</span>
      </div>

      <Reveal delay={0.1}>
        <TimetableView sessions={sessions} dates={dates} today={today} />
      </Reveal>
    </div>
  );
}
