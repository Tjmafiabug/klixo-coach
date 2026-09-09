"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveRule } from "@/lib/actions";
import type { FormOptions } from "@/lib/data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const field =
  "mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-60"
    >
      {pending ? "Saving…" : editing ? "Save changes" : "Add rule"}
    </button>
  );
}

export function RuleForm({
  options,
  today,
  rule,
  initial,
}: {
  options: FormOptions;
  today: string;
  rule?: {
    slot_id: string;
    batch_id: string;
    day_of_week: string;
    start: string;
    end: string;
    room_id: string;
    teacher_id: string;
    effective_from: string;
    effective_to: string;
  } | null;
  /** Defaults for a new rule, e.g. from clicking an empty calendar slot. */
  initial?: {
    day?: string;
    start?: string;
    end?: string;
    batchId?: string;
    roomId?: string;
    teacherId?: string;
  };
}) {
  const editing = !!rule;
  const first = options.batches[0];
  // A clicked batch carries its room/teacher; a clicked room/teacher overrides.
  const initBatch = options.batches.find((b) => b.id === initial?.batchId) ?? first;
  const [batchId, setBatchId] = useState(rule?.batch_id ?? initBatch?.id ?? "");
  const [roomId, setRoomId] = useState(rule?.room_id ?? initial?.roomId ?? initBatch?.roomId ?? "");
  const [teacherId, setTeacherId] = useState(rule?.teacher_id ?? initial?.teacherId ?? initBatch?.teacherId ?? "");
  const initialDays = new Set((rule?.day_of_week ?? initial?.day ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  const [days, setDays] = useState<Set<string>>(initialDays);

  function onBatch(id: string) {
    setBatchId(id);
    if (!editing) {
      const b = options.batches.find((x) => x.id === id);
      if (b) {
        setRoomId(b.roomId);
        setTeacherId(b.teacherId);
      }
    }
  }
  function toggleDay(d: string) {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  }

  return (
    <form
      action={saveRule}
      className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      {editing ? <input type="hidden" name="slotId" value={rule!.slot_id} /> : null}

      <label className="block">
        <span className="text-sm font-medium">Batch</span>
        <select name="batchId" value={batchId} onChange={(e) => onBatch(e.target.value)} className={`${field} cursor-pointer`}>
          {options.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <div className="mt-3">
        <span className="text-sm font-medium">Days</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = days.has(d);
            return (
              <label key={d} className="cursor-pointer">
                <input type="checkbox" name="days" value={d} checked={on} onChange={() => toggleDay(d)} className="peer sr-only" />
                <span className={`inline-flex h-9 w-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${on ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted-foreground hover:bg-muted"}`}>
                  {d}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Start</span>
          <input type="time" name="start" defaultValue={rule?.start ?? initial?.start ?? "16:00"} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">End</span>
          <input type="time" name="end" defaultValue={rule?.end ?? initial?.end ?? "17:30"} className={field} />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Room</span>
        <select name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${field} cursor-pointer`}>
          {options.rooms.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Teacher</span>
        <select name="teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${field} cursor-pointer`}>
          {options.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Effective from</span>
          <input type="date" name="effectiveFrom" defaultValue={rule?.effective_from || today} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Effective to <span className="text-muted-foreground">(optional)</span></span>
          <input type="date" name="effectiveTo" defaultValue={rule?.effective_to ?? ""} className={field} />
        </label>
      </div>

      {editing ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Saving regenerates only future, unmarked sessions of this slot. Past and
          already-marked classes are frozen.
        </p>
      ) : null}

      <Submit editing={editing} />
    </form>
  );
}
