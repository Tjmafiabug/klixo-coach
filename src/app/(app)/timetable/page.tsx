import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getTimetableView,
  getSessionsInRange,
  weekStartOf,
  weekDays,
  dayCell,
  addDays,
  effectiveToday,
  monthMatrix,
  type WeekDay,
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
  searchParams: Promise<{
    saved?: string;
    expired?: string;
    warn?: string;
    week?: string;
    view?: string;
    d?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const sp = await searchParams;
  const today = await effectiveToday();
  const view: "day" | "week" | "month" =
    sp.view === "day" || sp.view === "month" ? sp.view : "week";
  // anchor date (?d=, legacy ?week=, else today)
  const d = isISO(sp.d) ? sp.d! : isISO(sp.week) ? sp.week! : today;
  const weekStart = weekStartOf(d);
  const month = monthMatrix(d);

  let dates: WeekDay[] = [];
  let rangeStart: string;
  let rangeEnd: string;
  if (view === "day") {
    dates = [dayCell(d)];
    rangeStart = d;
    rangeEnd = d;
  } else if (view === "month") {
    rangeStart = month.weeks[0][0].iso;
    rangeEnd = month.weeks[5][6].iso;
  } else {
    dates = weekDays(weekStart);
    rangeStart = weekStart;
    rangeEnd = addDays(weekStart, 6);
  }

  const [{ clashes }, sessions] = await Promise.all([
    getTimetableView(),
    getSessionsInRange(rangeStart, rangeEnd),
  ]);

  const href = (v: string, dd: string) => `/timetable?view=${v}&d=${dd}`;
  let prevD: string;
  let nextD: string;
  let label: string;
  let atToday: boolean;
  if (view === "day") {
    prevD = addDays(d, -1);
    nextD = addDays(d, 1);
    label = `${dayCell(d).weekday} ${fmt(d)}, ${d.slice(0, 4)}`;
    atToday = d === today;
  } else if (view === "month") {
    prevD = month.prevAnchor;
    nextD = month.nextAnchor;
    label = month.label;
    atToday = monthMatrix(today).label === month.label;
  } else {
    prevD = addDays(weekStart, -7);
    nextD = addDays(weekStart, 7);
    label = `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}, ${addDays(weekStart, 6).slice(0, 4)}`;
    atToday = weekStart === weekStartOf(today);
  }
  const nav = {
    prevHref: href(view, prevD),
    nextHref: href(view, nextD),
    todayHref: href(view, today),
    label,
    atToday,
  };
  const viewHrefs = { day: href("day", d), week: href("week", d), month: href("month", d) };

  const notice = sp.saved ? "Timetable saved." : sp.expired ? "Rule expired." : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Timetable"
        subtitle="Class calendar"
        actions={
          <>
            <Link
              href="/new-session"
              className="inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold transition-colors hover:bg-muted"
            >
              + Extra class
            </Link>
            <PrimaryLink href="/timetable/new">+ Add rule</PrimaryLink>
          </>
        }
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

      <Reveal delay={0.1}>
        <TimetableView
          view={view}
          sessions={sessions}
          dates={dates}
          today={today}
          weekStart={weekStart}
          month={month}
          nav={nav}
          viewHrefs={viewHrefs}
          miniPrevHref={href(view, month.prevAnchor)}
          miniNextHref={href(view, month.nextAnchor)}
        />
      </Reveal>
    </div>
  );
}
