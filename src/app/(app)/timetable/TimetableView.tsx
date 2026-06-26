"use client";

import { useMemo, useState } from "react";
import type { TimetableRuleView } from "@/lib/data";
import { CalendarGrid } from "./CalendarGrid";

/* Scope filter over the weekly calendar — the readable answer to "everything at
   once is a cramped mess" (cf. Edmingle's Select Trainer/Batch). One dropdown:
   All, or scope to a single batch / teacher / room so parallel classes collapse
   to one readable track. The grid itself already trims the time axis to class
   hours, so there's no empty-night-hours waste. */

const field =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 cursor-pointer";

function uniq(pairs: [string, string][]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const [id, name] of pairs) if (id && !m.has(id)) m.set(id, name);
  return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function TimetableView({ rules }: { rules: TimetableRuleView[] }) {
  // "all" | "batch:<id>" | "teacher:<id>" | "room:<id>"
  const [scope, setScope] = useState("all");

  const opts = useMemo(
    () => ({
      batches: uniq(rules.map((r) => [r.batch_id, r.batchName])),
      teachers: uniq(rules.map((r) => [r.teacher_id, r.teacherName])),
      rooms: uniq(rules.map((r) => [r.room_id, r.roomName])),
    }),
    [rules],
  );

  const shown = useMemo(() => {
    const [type, id] = scope.split(":");
    if (type === "batch") return rules.filter((r) => r.batch_id === id);
    if (type === "teacher") return rules.filter((r) => r.teacher_id === id);
    if (type === "room") return rules.filter((r) => r.room_id === id);
    return rules;
  }, [rules, scope]);

  // Clicking an empty slot books into the active scope (batch/teacher/room).
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
          {shown.length} slot{shown.length === 1 ? "" : "s"}
        </span>
      </div>

      <CalendarGrid rules={shown} prefill={prefill} />
    </div>
  );
}
