"use client";

import { useMemo, useState } from "react";
import type { SessionView, WeekDay } from "@/lib/data";
import { CalendarGrid } from "./CalendarGrid";
import { AgendaGrid } from "./AgendaGrid";

/* Scope filter over the week's sessions. Two layouts, each fitting its job:
   - "All" → agenda (sorted chips per day): readable at any density, no wasted
     empty time.
   - Scoped to one batch/teacher/room → time-grid: sparse, so gaps read as
     "this room/teacher is free here". */

const field =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 cursor-pointer";

function uniq(pairs: [string, string][]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const [id, name] of pairs) if (id && !m.has(id)) m.set(id, name);
  return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function TimetableView({
  sessions,
  dates,
  today,
}: {
  sessions: SessionView[];
  dates: WeekDay[];
  today: string;
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

  // Stable, well-separated colour per batch (golden-angle), keyed off ALL the
  // week's sessions so a batch keeps the same hue in both layouts.
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

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label htmlFor="tt-scope" className="label-mono text-muted-foreground">
          View
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
        <span className="text-sm text-muted-foreground tabular-nums">
          {shown.length} class{shown.length === 1 ? "" : "es"}
        </span>
      </div>

      {scope === "all" ? (
        <AgendaGrid sessions={shown} dates={dates} hueOf={hueOf} today={today} />
      ) : (
        <CalendarGrid sessions={shown} dates={dates} hueOf={hueOf} today={today} prefill={prefill} />
      )}
    </div>
  );
}
