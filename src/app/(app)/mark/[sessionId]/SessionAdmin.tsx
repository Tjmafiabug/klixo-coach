"use client";

import { cancelSession, substituteTeacher } from "@/lib/actions";

export function SessionAdmin({
  sessionId,
  isOwner,
  currentTeacherId,
  teachers,
}: {
  sessionId: string;
  isOwner: boolean;
  currentTeacherId: string;
  teachers: { id: string; name: string }[];
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Session controls
      </p>

      {isOwner ? (
        <form
          action={substituteTeacher}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <label className="flex-1">
            <span className="block text-sm font-medium">Substitute teacher</span>
            <select
              name="teacherId"
              defaultValue={currentTeacherId}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-muted">
            Update
          </button>
        </form>
      ) : null}

      <form
        action={cancelSession}
        onSubmit={(e) => {
          if (!confirm("Cancel this session? Attendance won't be expected for it."))
            e.preventDefault();
        }}
        className="mt-3"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <button className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-danger/30 bg-danger-subtle px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
          Cancel session
        </button>
      </form>
    </div>
  );
}
