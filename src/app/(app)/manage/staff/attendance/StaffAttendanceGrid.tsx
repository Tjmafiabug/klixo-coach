"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveStaffAttendance } from "@/lib/actions";
import { initials } from "@/lib/format";
import type { StaffAttendanceStatus } from "@/lib/types";
import type { StaffDayMark } from "@/lib/data";

type Status = StaffAttendanceStatus;

type Entry = {
  staff_id: string;
  name: string;
  role: string;
  staff_type: "teaching" | "non_teaching";
  saved: Status | null;
  status: Status | null; // null = not chosen / unmarked
};

const OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: "present", label: "P", active: "bg-success text-white border-success" },
  { value: "absent", label: "A", active: "bg-danger text-white border-danger" },
  { value: "leave", label: "L", active: "bg-brand text-brand-foreground border-brand" },
  { value: "half_day", label: "½", active: "bg-warning text-white border-warning" },
];

// any change from the saved state is a write — including clearing a saved mark
// back to unmarked (sent as "" so the server blanks that day's row)
const isWrite = (e: Entry) => e.status !== e.saved;

function Dot({ className }: { className: string }) {
  return <span className={`h-2 w-2 rounded-full ${className}`} />;
}

function SubmitBar({
  counts,
  writeCount,
}: {
  counts: Record<Status, number>;
  writeCount: number;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border bg-surface/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3 text-sm font-medium tabular-nums">
        <span className="flex items-center gap-1 text-success"><Dot className="bg-success" /> {counts.present}</span>
        <span className="flex items-center gap-1 text-danger"><Dot className="bg-danger" /> {counts.absent}</span>
        <span className="flex items-center gap-1 text-brand"><Dot className="bg-brand" /> {counts.leave}</span>
        <span className="flex items-center gap-1 text-warning"><Dot className="bg-warning" /> {counts.half_day}</span>
      </div>
      <button
        type="submit"
        disabled={pending || writeCount === 0}
        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand px-6 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : writeCount === 0 ? "No changes" : `Save ${writeCount}`}
      </button>
    </div>
  );
}

export default function StaffAttendanceGrid({
  date,
  rows,
}: {
  date: string;
  rows: StaffDayMark[];
}) {
  const [entries, setEntries] = useState<Entry[]>(
    rows.map((r) => ({ ...r, status: r.saved })),
  );

  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, leave: 0, half_day: 0 };
    for (const e of entries) if (e.status) c[e.status] += 1;
    return c;
  }, [entries]);

  const writeCount = entries.filter(isWrite).length;

  function setStatus(id: string, status: Status) {
    setEntries((prev) =>
      prev.map((e) =>
        e.staff_id === id
          ? { ...e, status: e.status === status ? null : status } // tap again to clear
          : e,
      ),
    );
  }
  function allPresent() {
    setEntries((prev) => prev.map((e) => ({ ...e, status: "present" })));
  }

  const marks = entries
    .filter(isWrite)
    .map((e) => ({ staffId: e.staff_id, status: e.status ?? "" }));

  return (
    <form action={saveStaffAttendance} className="mt-5">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="marks" value={JSON.stringify(marks)} />

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {entries.length} staff
        </p>
        <button
          type="button"
          onClick={allPresent}
          className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-subtle"
        >
          Mark all present
        </button>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        {entries.map((e) => (
          <li key={e.staff_id} className="border-b border-border last:border-b-0">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {initials(e.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.staff_type === "teaching" ? "Teaching" : "Non-teaching"} · {e.role}
                  </p>
                </div>
              </div>
              <div
                role="group"
                aria-label={`Attendance for ${e.name}`}
                className="flex shrink-0 overflow-hidden rounded-lg border border-border"
              >
                {OPTIONS.map((o) => {
                  const active = e.status === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatus(e.staff_id, o.value)}
                      aria-pressed={active}
                      title={o.value.replace("_", "-")}
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center border-l border-border text-sm font-bold transition-colors first:border-l-0 ${
                        active ? o.active : "bg-surface text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <SubmitBar counts={counts} writeCount={writeCount} />
    </form>
  );
}
