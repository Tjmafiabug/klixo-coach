"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SessionView, WeekDay, MonthGrid } from "@/lib/data";
import { CalendarGrid } from "./CalendarGrid";
import { AgendaGrid } from "./AgendaGrid";
import { MonthView } from "./MonthView";
import { MiniCalendar } from "./MiniCalendar";

/* Two-pane calendar shell (Edmingle-style): a left rail with the month picker +
   filters + batch legend, and a main pane with a Day/Week/Month toggle, date
   navigation, and the grid. Day/Week reuse the agenda (All) / time-grid (scoped)
   layouts; Month is its own overview. */

const field =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 cursor-pointer";
const navBtn =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-muted";

function uniq(pairs: [string, string][]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const [id, name] of pairs) if (id && !m.has(id)) m.set(id, name);
  return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function TimetableView({
  view,
  sessions,
  dates,
  today,
  weekStart,
  month,
  nav,
  viewHrefs,
  miniPrevHref,
  miniNextHref,
}: {
  view: "day" | "week" | "month";
  sessions: SessionView[];
  dates: WeekDay[];
  today: string;
  weekStart: string;
  month: MonthGrid;
  nav: { prevHref: string; nextHref: string; todayHref: string; label: string; atToday: boolean };
  viewHrefs: { day: string; week: string; month: string };
  miniPrevHref: string;
  miniNextHref: string;
}) {
  // "all" | "batch:<id>" | "teacher:<id>" | "room:<id>"
  const [scope, setScope] = useState("all");

  const opts = useMemo(
    () => ({
      batches: uniq(sessions.map((s) => [s.batch_id, s.batchName])),
      teachers: uniq(sessions.map((s) => [s.teacher_id, s.teacherName])),
      rooms: uniq(sessions.map((s) => [s.room_id, s.roomName])),
    }),
    [sessions],
  );

  const hueOf = useMemo(() => {
    const ids = [...new Set(sessions.map((s) => s.batch_id))];
    const m = new Map(ids.map((id, i) => [id, Math.round((i * 137.508) % 360)]));
    return (id: string) => m.get(id) ?? 0;
  }, [sessions]);

  const shown = useMemo(() => {
    const [type, id] = scope.split(":");
    if (type === "batch") return sessions.filter((s) => s.batch_id === id);
    if (type === "teacher") return sessions.filter((s) => s.teacher_id === id);
    if (type === "room") return sessions.filter((s) => s.room_id === id);
    return sessions;
  }, [sessions, scope]);

  // An empty-slot click books an extra class into the active scope.
  const [type, id] = scope.split(":");
  const prefill =
    type === "batch" ? { batch: id }
    : type === "teacher" ? { teacher: id }
    : type === "room" ? { room: id }
    : undefined;

  const viewTab = (v: "day" | "week" | "month", href: string, labelText: string) => (
    <Link
      href={href}
      className={`inline-flex h-8 items-center px-3 text-sm font-medium transition-colors ${
        view === v ? "bg-brand text-brand-foreground" : "bg-surface hover:bg-muted"
      }`}
    >
      {labelText}
    </Link>
  );

  return (
    <div className="mt-5 lg:flex lg:gap-6">
      {/* Left rail */}
      <aside className="shrink-0 space-y-4 lg:w-64">
        <MiniCalendar
          month={month}
          weekStart={weekStart}
          today={today}
          prevHref={miniPrevHref}
          nextHref={miniNextHref}
          view={view}
        />

        <div>
          <label htmlFor="tt-scope" className="label-mono mb-1.5 block text-muted-foreground">
            Filter
          </label>
          <select
            id="tt-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={field}
          >
            <option value="all">All classes</option>
            <optgroup label="By batch">
              {opts.batches.map((b) => (
                <option key={b.id} value={`batch:${b.id}`}>{b.name}</option>
              ))}
            </optgroup>
            <optgroup label="By teacher">
              {opts.teachers.map((t) => (
                <option key={t.id} value={`teacher:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
            <optgroup label="By room">
              {opts.rooms.map((r) => (
                <option key={r.id} value={`room:${r.id}`}>{r.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {opts.batches.length > 0 ? (
          <div>
            <p className="label-mono mb-1.5 text-muted-foreground">Batches</p>
            <ul className="space-y-0.5">
              {opts.batches.map((b) => {
                const active = scope === `batch:${b.id}`;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setScope(active ? "all" : `batch:${b.id}`)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                        active ? "bg-muted font-medium" : "hover:bg-muted"
                      }`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: `hsl(${hueOf(b.id)} 60% 50%)` }}
                      />
                      <span className="truncate">{b.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </aside>

      {/* Main pane */}
      <div className="mt-5 min-w-0 flex-1 lg:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {viewTab("day", viewHrefs.day, "Day")}
            <span className="w-px bg-border" />
            {viewTab("week", viewHrefs.week, "Week")}
            <span className="w-px bg-border" />
            {viewTab("month", viewHrefs.month, "Month")}
          </div>
          <Link href={nav.prevHref} className={navBtn} aria-label="Previous">‹</Link>
          <Link href={nav.nextHref} className={navBtn} aria-label="Next">›</Link>
          {!nav.atToday ? (
            <Link href={nav.todayHref} className={navBtn}>Today</Link>
          ) : null}
          <span className="ml-1 text-sm font-semibold tabular-nums">{nav.label}</span>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {shown.length} class{shown.length === 1 ? "" : "es"}
          </span>
        </div>

        {view === "month" ? (
          <MonthView sessions={shown} month={month} today={today} hueOf={hueOf} />
        ) : scope === "all" ? (
          <AgendaGrid sessions={shown} dates={dates} hueOf={hueOf} today={today} />
        ) : (
          <CalendarGrid sessions={shown} dates={dates} hueOf={hueOf} today={today} prefill={prefill} />
        )}
      </div>
    </div>
  );
}
