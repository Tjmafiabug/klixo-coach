import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStaffTaskBoard } from "@/lib/data";
import type { StaffTaskStatus } from "@/lib/types";
import { paginate, shortDate } from "@/lib/format";
import { addStaffTask, updateStaffTaskStatus } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { PageHeader, Pager } from "@/components/page";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

type Filter = "open" | "done" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

const STATUS_CHIP: Record<StaffTaskStatus, string> = {
  open: "bg-brand/10 text-brand",
  done: "bg-success-subtle text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export default async function StaffTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; saved?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [board, sp] = await Promise.all([getStaffTaskBoard(), searchParams]);

  const filter: Filter =
    sp.status === "done" || sp.status === "all" ? sp.status : "open";
  const filtered =
    filter === "all" ? board.tasks : board.tasks.filter((t) => t.status === filter);
  const { slice, page, pages, total, start, size } = paginate(filtered, Number(sp.page));

  const params = new URLSearchParams();
  if (filter !== "open") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const back = `/manage/staff/tasks${params.toString() ? `?${params}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage/staff"
        backLabel="Staff"
        title="Tasks & duties"
        subtitle={`${board.counts.open} open`}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Task saved.</Banner>
        </div>
      ) : null}
      {sp.error === "missing" ? (
        <div className="mt-4">
          <Banner tone="danger">Pick a staffer and enter a task title.</Banner>
        </div>
      ) : null}

      {/* quick add */}
      <form
        action={addStaffTask}
        className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold text-foreground">Assign a task</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Staffer</span>
            <select name="staffId" defaultValue="" className={`${fieldClass} cursor-pointer`}>
              <option value="" disabled>
                Choose…
              </option>
              {board.staffOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Due <span className="text-muted-foreground/70">(optional)</span>
            </span>
            <input type="date" name="due_date" className={fieldClass} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted-foreground">Task</span>
          <input name="title" placeholder="e.g. Follow up on April fee dues" className={fieldClass} />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted-foreground">
            Detail <span className="text-muted-foreground/70">(optional)</span>
          </span>
          <input name="detail" className={fieldClass} />
        </label>
        <div className="mt-3">
          <SubmitButton pendingText="Adding…">Add task</SubmitButton>
        </div>
      </form>

      {/* filter */}
      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const p = new URLSearchParams();
          if (f.key !== "open") p.set("status", f.key);
          const href = `/manage/staff/tasks${p.toString() ? `?${p}` : ""}`;
          const on = f.key === filter;
          const n = f.key === "all" ? board.tasks.length : board.counts[f.key as StaffTaskStatus];
          return (
            <Link
              key={f.key}
              href={href}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label} ({n})
            </Link>
          );
        })}
      </div>

      {total === 0 ? (
        <div className="mt-6 grid h-[140px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {filter === "open" ? "No open tasks. Nice." : "No tasks here."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {slice.map((t) => (
            <li
              key={t.task_id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{t.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t.staff_name}
                    {t.due_date ? (
                      <>
                        {" · "}
                        <span className={t.overdue ? "font-semibold text-danger" : ""}>
                          due {shortDate(t.due_date)}
                          {t.overdue ? " · overdue" : ""}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {t.detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${STATUS_CHIP[t.status]}`}
                >
                  {t.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {t.status === "open" ? (
                  <>
                    <StatusButton taskId={t.task_id} status="done" back={back} tone="success">
                      Mark done
                    </StatusButton>
                    <StatusButton taskId={t.task_id} status="cancelled" back={back} tone="muted">
                      Cancel
                    </StatusButton>
                  </>
                ) : (
                  <StatusButton taskId={t.task_id} status="open" back={back} tone="muted">
                    Reopen
                  </StatusButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        pages={pages}
        total={total}
        start={start}
        size={size}
        baseHref="/manage/staff/tasks"
        params={{ status: filter === "open" ? undefined : filter }}
      />
    </div>
  );
}

function StatusButton({
  taskId,
  status,
  back,
  tone,
  children,
}: {
  taskId: string;
  status: StaffTaskStatus;
  back: string;
  tone: "success" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success-subtle text-success hover:bg-success/10"
      : "border-border bg-surface text-muted-foreground hover:bg-muted";
  return (
    <form action={updateStaffTaskStatus}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="back" value={back} />
      <button
        className={`h-9 cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors ${cls}`}
      >
        {children}
      </button>
    </form>
  );
}
