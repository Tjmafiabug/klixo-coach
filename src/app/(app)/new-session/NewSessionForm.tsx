"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { addExtraClass } from "@/lib/actions";
import type { FormOptions } from "@/lib/data";

const field =
  "mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add extra class"}
    </button>
  );
}

export function NewSessionForm({
  options,
  today,
  initial,
}: {
  options: FormOptions;
  today: string;
  /** Defaults from clicking an empty calendar slot. */
  initial?: {
    date?: string;
    start?: string;
    end?: string;
    batchId?: string;
    roomId?: string;
    teacherId?: string;
    returnTo?: string;
  };
}) {
  const first = options.batches[0];
  // A clicked batch carries its room/teacher; a clicked room/teacher overrides.
  const initBatch = options.batches.find((b) => b.id === initial?.batchId) ?? first;
  const [batchId, setBatchId] = useState(initBatch?.id ?? "");
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? initBatch?.teacherId ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? initBatch?.roomId ?? "");

  function onBatch(id: string) {
    setBatchId(id);
    const b = options.batches.find((x) => x.id === id);
    if (b) {
      setTeacherId(b.teacherId);
      setRoomId(b.roomId);
    }
  }

  return (
    <form
      action={addExtraClass}
      className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      {initial?.returnTo ? (
        <input type="hidden" name="returnTo" value={initial.returnTo} />
      ) : null}
      <label className="block">
        <span className="text-sm font-medium">Batch</span>
        <select
          name="batchId"
          value={batchId}
          onChange={(e) => onBatch(e.target.value)}
          className={`${field} cursor-pointer`}
        >
          {options.batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Date</span>
        <input type="date" name="date" defaultValue={initial?.date ?? today} className={field} />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Start</span>
          <input type="time" name="start" defaultValue={initial?.start ?? "11:00"} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">End</span>
          <input type="time" name="end" defaultValue={initial?.end ?? "12:00"} className={field} />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Room</span>
        <select
          name="roomId"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className={`${field} cursor-pointer`}
        >
          {options.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Teacher</span>
        <select
          name="teacherId"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className={`${field} cursor-pointer`}
        >
          {options.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <Submit />
    </form>
  );
}
