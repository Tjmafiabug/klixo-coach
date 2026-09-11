"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ENTRANCE, EXIT, MICRO, SLIDE } from "@/components/motion";
import { submitMarks } from "@/lib/actions";
import type { AttendanceStatus } from "@/lib/types";
import type { RosterEntry } from "@/lib/data";

type Entry = {
  student_id: string;
  name: string;
  saved: AttendanceStatus | null;
  status: AttendanceStatus;
  reason: string;
};

const OPTIONS: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "present", label: "P", active: "bg-success text-white border-success" },
  { value: "absent", label: "A", active: "bg-danger text-white border-danger" },
  { value: "late", label: "L", active: "bg-warning text-white border-warning" },
];

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const isChanged = (e: Entry) => e.saved !== null && e.status !== e.saved;
const isWrite = (e: Entry) => e.saved === null || e.status !== e.saved;

function Dot({ className }: { className: string }) {
  return <span className={`h-2 w-2 rounded-full ${className}`} />;
}

function SubmitBar({
  counts,
  writeCount,
  unmarked,
}: {
  counts: Record<AttendanceStatus, number>;
  writeCount: number;
  /** Students on a past session never marked yet — the "N left" signal. */
  unmarked: number;
}) {
  const { pending } = useFormStatus();
  const reduce = useReducedMotion();
  return (
    // Fixed to the viewport, not sticky inside the form: sticky let roster rows
    // scroll *under* the bar and render below it, which read as a broken overlay.
    // Sits above the app tab bar (56px + safe-area inset) on mobile.
    <div className="fixed inset-x-0 bottom-[var(--tabbar-h,0px)] z-20 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:-mx-4 lg:mt-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-3 text-sm font-medium tabular-nums">
          <span className="flex items-center gap-1 text-success"><Dot className="bg-success" /> {counts.present}</span>
          <span className="flex items-center gap-1 text-danger"><Dot className="bg-danger" /> {counts.absent}</span>
          <span className="flex items-center gap-1 text-warning"><Dot className="bg-warning" /> {counts.late}</span>
        </div>
        {unmarked > 0 ? (
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {unmarked} not marked yet
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending || writeCount === 0}
        className="inline-flex h-12 min-w-[7.5rem] cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-6 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* The moment a teacher hits 40x a day: the label swaps for a check that
            springs in the instant the action is in flight, so the tap is
            acknowledged before the server round-trip to Sheets finishes. */}
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.span
              key="saving"
              className="flex items-center gap-2"
              initial={reduce ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={ENTRANCE}
            >
              <CheckIcon /> Saving
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={reduce ? false : { opacity: 0, y: SLIDE / 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={EXIT}
            >
              {writeCount === 0 ? "No changes" : `Submit ${writeCount}`}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export default function MarkRoster({
  sessionId,
  roster,
  isPast,
  alreadyMarked,
}: {
  sessionId: string;
  roster: RosterEntry[];
  isPast: boolean;
  alreadyMarked: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>(
    roster.map((r) => ({
      student_id: r.student_id,
      name: r.name,
      saved: r.saved,
      status: r.saved ?? "present",
      reason: "",
    })),
  );
  const [backfillReason, setBackfillReason] = useState("");
  const reduce = useReducedMotion();

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0 };
    for (const e of entries) c[e.status] += 1;
    return c;
  }, [entries]);

  const writeCount = entries.filter(isWrite).length;
  // backfill reason needed if any never-marked student is being saved on a past session
  const needsBackfill = isPast && entries.some((e) => e.saved === null);

  function setStatus(id: string, status: AttendanceStatus) {
    setEntries((prev) =>
      prev.map((e) => (e.student_id === id ? { ...e, status } : e)),
    );
  }
  function setReason(id: string, reason: string) {
    setEntries((prev) =>
      prev.map((e) => (e.student_id === id ? { ...e, reason } : e)),
    );
  }
  function allPresent() {
    setEntries((prev) => prev.map((e) => ({ ...e, status: "present" })));
  }

  const marks = entries.map((e) => ({ studentId: e.student_id, status: e.status }));
  const reasons = Object.fromEntries(
    entries.filter(isChanged).map((e) => [e.student_id, e.reason]),
  );

  return (
    <form action={submitMarks} className="mt-5 pb-24 lg:pb-0">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="marks" value={JSON.stringify(marks)} />
      <input type="hidden" name="reasons" value={JSON.stringify(reasons)} />

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Roster
        </p>
        {!alreadyMarked ? (
          <motion.button
            type="button"
            onClick={allPresent}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={MICRO}
            className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-brand-subtle px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand-100"
          >
            Mark all present
          </motion.button>
        ) : null}
      </div>

      <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        {entries.map((e) => {
          const changed = isChanged(e);
          return (
            <li key={e.student_id} className="border-b border-border last:border-b-0">
              <div className="flex min-h-[56px] items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
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
                      <motion.button
                        key={o.value}
                        type="button"
                        onClick={() => setStatus(e.student_id, o.value)}
                        aria-pressed={active}
                        title={o.value}
                        // 44px: the WCAG 2.2 AA / HIG minimum for a thumb tap.
                        whileTap={reduce ? undefined : { scale: 0.94 }}
                        transition={MICRO}
                        className={`flex h-11 w-11 cursor-pointer items-center justify-center border-l border-border text-sm font-bold transition-colors first:border-l-0 ${
                          active ? o.active : "bg-surface text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {o.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
              <AnimatePresence initial={false}>
              {changed ? (
                <motion.div
                  key="reason"
                  className="overflow-hidden px-3 pb-2.5"
                  initial={reduce ? false : { opacity: 0, y: -SLIDE / 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={ENTRANCE}
                >
                  <input
                    required
                    value={e.reason}
                    onChange={(ev) => setReason(e.student_id, ev.target.value)}
                    placeholder={`Reason — changed ${e.saved} → ${e.status}`}
                    className="h-9 w-full rounded-lg border border-warning/40 bg-warning-subtle/40 px-3 text-sm outline-none focus:border-warning focus:ring-2 focus:ring-warning/20"
                  />
                </motion.div>
              ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {needsBackfill ? (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <label className="text-sm font-medium text-foreground">
            Reason for marking this past class
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            e.g. Entered after class, app was down. Logged for the owner.
          </p>
          <input
            required
            name="backfillReason"
            value={backfillReason}
            onChange={(e) => setBackfillReason(e.target.value)}
            placeholder="Reason"
            className="mt-2 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      ) : null}

      <SubmitBar
        counts={counts}
        writeCount={writeCount}
        unmarked={entries.filter((e) => e.saved === null).length}
      />
    </form>
  );
}
