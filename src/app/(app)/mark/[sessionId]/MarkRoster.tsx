"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitMarks } from "@/lib/actions";
import type { AttendanceStatus } from "@/lib/types";
import type { RosterEntry } from "@/lib/data";

type Entry = { student_id: string; name: string; status: AttendanceStatus };

const OPTIONS: {
  value: AttendanceStatus;
  label: string;
  active: string;
}[] = [
  { value: "present", label: "P", active: "bg-success text-white border-success" },
  { value: "absent", label: "A", active: "bg-danger text-white border-danger" },
  { value: "late", label: "L", active: "bg-warning text-white border-warning" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SubmitBar({ counts }: { counts: Record<AttendanceStatus, number> }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border bg-surface/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3 text-sm font-medium tabular-nums">
        <span className="flex items-center gap-1 text-success">
          <Dot className="bg-success" /> {counts.present}
        </span>
        <span className="flex items-center gap-1 text-danger">
          <Dot className="bg-danger" /> {counts.absent}
        </span>
        <span className="flex items-center gap-1 text-warning">
          <Dot className="bg-warning" /> {counts.late}
        </span>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand px-6 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Submit attendance"}
      </button>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-2 w-2 rounded-full ${className}`} />;
}

export default function MarkRoster({
  sessionId,
  roster,
}: {
  sessionId: string;
  roster: RosterEntry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(
    roster.map((r) => ({ student_id: r.student_id, name: r.name, status: r.status })),
  );
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState("");

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0 };
    for (const e of entries) c[e.status] += 1;
    return c;
  }, [entries]);

  function setStatus(id: string, status: AttendanceStatus) {
    setEntries((prev) =>
      prev.map((e) => (e.student_id === id ? { ...e, status } : e)),
    );
  }

  function allPresent() {
    setEntries((prev) => prev.map((e) => ({ ...e, status: "present" })));
  }

  const payload = entries.map((e) => ({ studentId: e.student_id, status: e.status }));

  return (
    <form action={submitMarks} className="mt-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="marks" value={JSON.stringify(payload)} />
      <input type="hidden" name="method" value={manual ? "manual" : "app"} />

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Roster
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
          <li
            key={e.student_id}
            className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {initials(e.name)}
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {e.name}
              </span>
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
                    onClick={() => setStatus(e.student_id, o.value)}
                    aria-pressed={active}
                    title={o.value}
                    className={`flex h-10 w-10 cursor-pointer items-center justify-center border-l border-border text-sm font-bold transition-colors first:border-l-0 ${
                      active
                        ? o.active
                        : "bg-surface text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <span className="text-sm font-medium text-foreground">
              Manual / corrected entry
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Marking late, fixing a mistake, or the app was down. Logged for the owner.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={manual}
            onClick={() => setManual((v) => !v)}
            className={`relative mt-0.5 h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors ${
              manual ? "bg-brand" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                manual ? "left-[1.125rem]" : "left-0.5"
              }`}
            />
          </button>
        </label>
        {manual ? (
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Reason — e.g. Entered after class"
            className="mt-3 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        ) : null}
      </div>

      <SubmitBar counts={counts} />
    </form>
  );
}
