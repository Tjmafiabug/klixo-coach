"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionView, WeekDay } from "@/lib/data";

/* Date-aware week grid. Columns are the seven dates of the selected week, time
   is the vertical axis (1px per minute). Each real Session is placed on its
   date; overlapping classes pack side-by-side. Clicking a class opens its
   attendance page; clicking an empty slot (today or later) opens the
   "add extra class" form prefilled with that date/time and the active scope.
   Used for the scoped views (one batch/teacher/room). */

const PPM = 1; // pixels per minute
const SNAP = 60; // axis snaps to whole hours
const BOOK_SNAP = 30; // click-to-book rounds to half hours
const DEFAULT_LEN = 90; // default extra-class length, minutes

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Scope carried into the new extra-class form when an empty slot is clicked. */
export interface BookPrefill {
  batch?: string;
  teacher?: string;
  room?: string;
}

interface Ev {
  session: SessionView;
  s: number;
  e: number;
}
interface Block extends Ev {
  col: number;
  cols: number;
}

/** Greedy column packing: split a day's events into overlap clusters, then place
 *  each in the first free column. Returns each with its column index + cluster width. */
function packDay(events: Ev[]): Block[] {
  const sorted = [...events].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: Block[] = [];
  let cluster: Ev[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    const placed = cluster.map((ev) => {
      let c = colEnds.findIndex((end) => end <= ev.s);
      if (c === -1) {
        c = colEnds.length;
        colEnds.push(ev.e);
      } else {
        colEnds[c] = ev.e;
      }
      return { ev, col: c };
    });
    const cols = colEnds.length;
    for (const p of placed) out.push({ ...p.ev, col: p.col, cols });
    cluster = [];
  };

  for (const ev of sorted) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarGrid({
  sessions,
  dates,
  hueOf,
  today,
  prefill,
}: {
  sessions: SessionView[];
  dates: WeekDay[];
  hueOf: (batchId: string) => number;
  today: string;
  prefill?: BookPrefill;
}) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-16 text-center">
        <p className="font-semibold text-foreground">No classes this week</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing scheduled for the selected week.
        </p>
      </div>
    );
  }

  // Operating-day window, NOT trimmed to the busy band — empty hours are bookable
  // capacity. Defaults to 08:00–21:00, expanded to fit any class outside it.
  // ponytail: fixed window; make DAY_START/DAY_END config if a centre's hours differ.
  const DAY_START = 8 * 60;
  const DAY_END = 21 * 60;
  let minM = Infinity;
  let maxM = -Infinity;
  for (const s of sessions) {
    minM = Math.min(minM, toMin(s.start));
    maxM = Math.max(maxM, toMin(s.end));
  }
  const rangeStart = Math.min(Math.floor(minM / SNAP) * SNAP, DAY_START);
  const rangeEnd = Math.max(Math.ceil(maxM / SNAP) * SNAP, DAY_END);
  const height = (rangeEnd - rangeStart) * PPM;
  const hours: number[] = [];
  for (let h = rangeStart; h <= rangeEnd; h += SNAP) hours.push(h);

  // Per-date packed blocks.
  const byDay = dates.map((d) => ({
    d,
    blocks: packDay(
      sessions
        .filter((s) => s.date === d.iso)
        .map((s) => ({ session: s, s: toMin(s.start), e: toMin(s.end) })),
    ),
  }));

  // Click an empty slot → add an extra class on that date, prefilled with the
  // clicked time and the active scope (batch/teacher/room).
  function book(iso: string, e: React.MouseEvent<HTMLDivElement>) {
    const offsetY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const snapped = Math.round((rangeStart + offsetY / PPM) / BOOK_SNAP) * BOOK_SNAP;
    const start = Math.max(rangeStart, Math.min(snapped, rangeEnd - BOOK_SNAP));
    const end = Math.min(start + DEFAULT_LEN, rangeEnd);
    const qs = new URLSearchParams({ date: iso, start: toHHMM(start), end: toHHMM(end) });
    if (prefill?.batch) qs.set("batch", prefill.batch);
    if (prefill?.teacher) qs.set("teacher", prefill.teacher);
    if (prefill?.room) qs.set("room", prefill.room);
    router.push(`/new-session?${qs}`);
  }

  return (
    <div className="mt-4 max-h-[70vh] overflow-auto scroll-slim rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div
        className="grid min-w-[760px]"
        style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(100px, 1fr))` }}
      >
        {/* Header row — sticky to the top so date headers stay visible while scrolling */}
        <div className="sticky left-0 top-0 z-30 border-b border-border bg-surface" />
        {dates.map((d) => {
          const isToday = d.iso === today;
          return (
            <div
              key={d.iso}
              className={`sticky top-0 z-20 border-b border-l border-border px-2 py-2 text-center ${
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
          );
        })}

        {/* Time gutter — sticky to the left so hour labels stay visible */}
        <div className="sticky left-0 z-10 bg-surface" style={{ height }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute -translate-y-1/2 pr-2 text-right tabular-nums label-mono text-muted-foreground"
              style={{ top: (h - rangeStart) * PPM, right: 0, width: 56 }}
            >
              {String(Math.floor(h / 60)).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {byDay.map(({ d, blocks }) => (
          <div
            key={d.iso}
            className={`relative border-l border-border ${d.iso === today ? "bg-accent-subtle/30" : ""}`}
            style={{ height }}
          >
            {/* click-to-book layer (back of stack); only future/today is bookable */}
            {d.iso >= today ? (
              <div
                onClick={(e) => book(d.iso, e)}
                title={`Add an extra class on ${d.weekday} ${d.dayNum}`}
                className="absolute inset-0 cursor-copy transition-colors hover:bg-accent/5"
              />
            ) : null}

            {hours.slice(0, -1).map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                style={{ top: (h - rangeStart) * PPM }}
              />
            ))}

            {blocks.map(({ session, s, e, col, cols }) => {
              const hue = hueOf(session.batch_id);
              const top = (s - rangeStart) * PPM;
              const blockH = Math.max((e - s) * PPM, 30);
              const widthPct = 100 / cols;
              const cancelled = session.status === "cancelled";
              const style = {
                top,
                height: blockH - 3,
                left: `calc(${col * widthPct}% + 3px)`,
                width: `calc(${widthPct}% - 6px)`,
                background: `hsl(${hue} 70% 96%)`,
                borderColor: `hsl(${hue} 55% 78%)`,
                borderLeftColor: `hsl(${hue} 60% 50%)`,
                color: `hsl(${hue} 45% 26%)`,
              };
              const inner = (
                <>
                  <p className={`truncate text-[0.78rem] font-semibold leading-tight ${cancelled ? "line-through opacity-60" : ""}`}>
                    {session.batchName}
                  </p>
                  <p className="truncate text-[0.68rem] tabular-nums opacity-80">
                    {session.start}–{session.end}
                  </p>
                  {blockH > 56 ? (
                    <p className="truncate text-[0.68rem] opacity-70">
                      {session.roomName} · {session.teacherName}
                    </p>
                  ) : null}
                  {session.status === "extra" ? (
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
              const base = "group absolute overflow-hidden rounded-lg border border-l-[3px] px-2 py-1";
              // Projected (unwritten future) classes aren't markable yet — render
              // them planned-looking and non-clickable instead of linking to a 404.
              return session.projected ? (
                <div
                  key={session.session_id}
                  title="Planned — generated closer to the date"
                  className={`${base} border-dashed opacity-75`}
                  style={style}
                >
                  {inner}
                </div>
              ) : (
                <Link
                  key={session.session_id}
                  href={`/mark/${session.session_id}`}
                  className={`${base} transition-shadow hover:z-10 hover:shadow-[var(--shadow-pop)]`}
                  style={style}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
