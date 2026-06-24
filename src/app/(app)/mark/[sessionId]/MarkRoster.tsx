"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitMarks } from "@/lib/actions";
import type { AttendanceStatus } from "@/lib/types";
import type { RosterEntry } from "@/lib/data";

type Entry = { student_id: string; name: string; status: AttendanceStatus };

const OPTIONS: { value: AttendanceStatus; label: string; cls: string }[] = [
  { value: "present", label: "Present", cls: "bg-green-600 text-white border-green-600" },
  { value: "absent", label: "Absent", cls: "bg-red-600 text-white border-red-600" },
  { value: "late", label: "Late", cls: "bg-amber-500 text-white border-amber-500" },
];

function SubmitBar({ counts }: { counts: Record<AttendanceStatus, number> }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-black/10 bg-white/90 px-1 py-3 backdrop-blur dark:border-white/15 dark:bg-black/70">
      <p className="text-sm text-black/60 dark:text-white/60">
        <span className="text-green-700 dark:text-green-400">{counts.present} present</span>
        {" · "}
        <span className="text-red-600">{counts.absent} absent</span>
        {" · "}
        <span className="text-amber-600">{counts.late} late</span>
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Submit"}
      </button>
    </div>
  );
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

  const payload = entries.map((e) => ({ studentId: e.student_id, status: e.status }));

  return (
    <form action={submitMarks}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="marks" value={JSON.stringify(payload)} />

      <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
        {entries.map((e) => (
          <li
            key={e.student_id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <span className="font-medium">{e.name}</span>
            <div className="flex gap-1">
              {OPTIONS.map((o) => {
                const active = e.status === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStatus(e.student_id, o.value)}
                    aria-pressed={active}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? o.cls
                        : "border-black/15 text-black/55 hover:bg-black/5 dark:border-white/20 dark:text-white/55 dark:hover:bg-white/10"
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

      <SubmitBar counts={counts} />
    </form>
  );
}
