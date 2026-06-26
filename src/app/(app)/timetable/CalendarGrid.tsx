"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TimetableRuleView } from "@/lib/data";

/* Weekly calendar grid for recurring timetable rules.
   Days are columns, time is the vertical axis (1px per minute). Each rule paints
   a block on every day it runs; classes that overlap within a day are packed
   side-by-side (Google-Calendar style). Empty space is bookable: clicking it
   opens the new-rule form prefilled with that day/time (and the active scope). */

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PPM = 1; // pixels per minute
const SNAP = 60; // axis snaps to whole hours
const BOOK_SNAP = 30; // click-to-book rounds to half hours
const DEFAULT_LEN = 90; // default new-class length, minutes

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Prefill carried into the new-rule form when an empty slot is clicked. */
export interface BookPrefill {
  batch?: string;
  teacher?: string;
  room?: string;
}

interface Block {
  rule: TimetableRuleView;
  s: number;
  e: number;
  col: number;
  cols: number;
}

/** Greedy column packing: split a day's events into overlap clusters, then place
 *  each in the first free column. Returns each with its column index + cluster width. */
function packDay(events: { rule: TimetableRuleView; s: number; e: number }[]): Block[] {
  const sorted = [...events].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: Block[] = [];
  let cluster: { rule: TimetableRuleView; s: number; e: number }[] = [];
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
  rules,
  prefill,
  hueOf,
}: {
  rules: TimetableRuleView[];
  prefill?: BookPrefill;
  hueOf: (batchId: string) => number;
}) {
  const router = useRouter();

  if (rules.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-16 text-center">
        <p className="font-semibold text-foreground">No classes scheduled yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a recurring rule to see it on the weekly calendar.
        </p>
      </div>
    );
  }

  // Full week, Mon→Sun.
  const activeDays = DAY_ORDER;

  // Vertical range, snapped to whole hours, with a little breathing room.
  let minM = Infinity;
  let maxM = -Infinity;
  for (const r of rules) {
    minM = Math.min(minM, toMin(r.start));
    maxM = Math.max(maxM, toMin(r.end));
  }
  // Operating-day window, NOT trimmed to the busy band — the empty hours are
  // bookable capacity (open room/teacher time you can schedule into). Defaults
  // to 08:00–21:00, expanded to fit any class outside it.
  // ponytail: fixed window; make DAY_START/DAY_END config if a centre's hours differ.
  const DAY_START = 8 * 60;
  const DAY_END = 21 * 60;
  const rangeStart = Math.min(Math.floor(minM / SNAP) * SNAP, DAY_START);
  const rangeEnd = Math.max(Math.ceil(maxM / SNAP) * SNAP, DAY_END);
  const height = (rangeEnd - rangeStart) * PPM;
  const hours: number[] = [];
  for (let h = rangeStart; h <= rangeEnd; h += SNAP) hours.push(h);

  // Per-day packed blocks.
  const byDay = activeDays.map((day) => {
    const events = rules
      .filter((r) => r.days.includes(day))
      .map((r) => ({ rule: r, s: toMin(r.start), e: toMin(r.end) }));
    return { day, blocks: packDay(events) };
  });

  // Click an empty slot → new-rule form, prefilled with that day/time + scope.
  function book(day: string, e: React.MouseEvent<HTMLDivElement>) {
    const offsetY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const raw = rangeStart + offsetY / PPM;
    // Snap to the half hour, clamped so there's always room for a real slot.
    const snapped = Math.round(raw / BOOK_SNAP) * BOOK_SNAP;
    const start = Math.max(rangeStart, Math.min(snapped, rangeEnd - BOOK_SNAP));
    const end = Math.min(start + DEFAULT_LEN, rangeEnd);
    const qs = new URLSearchParams({ day, start: toHHMM(start), end: toHHMM(end) });
    if (prefill?.batch) qs.set("batch", prefill.batch);
    if (prefill?.teacher) qs.set("teacher", prefill.teacher);
    if (prefill?.room) qs.set("room", prefill.room);
    router.push(`/timetable/new?${qs}`);
  }

  return (
    <div className="mt-4 max-h-[70vh] overflow-auto scroll-slim rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div
        className="grid min-w-[760px]"
        style={{
          gridTemplateColumns: `56px repeat(${activeDays.length}, minmax(100px, 1fr))`,
        }}
      >
        {/* Header row — sticky to the top so day names stay visible while scrolling */}
        <div className="sticky left-0 top-0 z-30 border-b border-border bg-surface" />
        {activeDays.map((d) => (
          <div
            key={d}
            className="sticky top-0 z-20 border-b border-l border-border bg-surface px-3 py-2.5 text-center"
          >
            <span className="label-mono text-muted-foreground">{d}</span>
          </div>
        ))}

        {/* Time gutter — sticky to the left so hour labels stay visible */}
        <div
          className="sticky left-0 z-10 bg-surface"
          style={{ height }}
        >
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
        {byDay.map(({ day, blocks }) => (
          <div
            key={day}
            className="relative border-l border-border"
            style={{ height }}
          >
            {/* click-to-book layer (back of stack); blocks paint above it */}
            <div
              onClick={(e) => book(day, e)}
              title={`Add a class on ${day}`}
              className="absolute inset-0 cursor-copy transition-colors hover:bg-accent/5"
            />

            {/* hour gridlines — non-interactive so empty clicks reach the layer */}
            {hours.slice(0, -1).map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                style={{ top: (h - rangeStart) * PPM }}
              />
            ))}

            {blocks.map(({ rule, s, e, col, cols }) => {
              const hue = hueOf(rule.batch_id);
              const top = (s - rangeStart) * PPM;
              const blockH = Math.max((e - s) * PPM, 30);
              const widthPct = 100 / cols;
              return (
                <Link
                  key={`${rule.slot_id}-${day}`}
                  href={`/timetable/${rule.slot_id}`}
                  className="group absolute overflow-hidden rounded-lg border border-l-[3px] px-2 py-1 transition-shadow hover:z-10 hover:shadow-[var(--shadow-pop)]"
                  style={{
                    top,
                    height: blockH - 3,
                    left: `calc(${col * widthPct}% + 3px)`,
                    width: `calc(${widthPct}% - 6px)`,
                    background: `hsl(${hue} 70% 96%)`,
                    borderColor: `hsl(${hue} 55% 78%)`,
                    borderLeftColor: `hsl(${hue} 60% 50%)`,
                    color: `hsl(${hue} 45% 26%)`,
                  }}
                >
                  <p className="truncate text-[0.78rem] font-semibold leading-tight">
                    {rule.batchName}
                  </p>
                  <p className="truncate text-[0.68rem] tabular-nums opacity-80">
                    {rule.start}–{rule.end}
                  </p>
                  {blockH > 56 ? (
                    <p className="truncate text-[0.68rem] opacity-70">
                      {rule.roomName} · {rule.teacherName}
                    </p>
                  ) : null}
                  {rule.effective_to ? (
                    <span className="mt-0.5 inline-block rounded bg-warning-subtle px-1 text-[0.6rem] font-semibold text-warning">
                      until {rule.effective_to}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
