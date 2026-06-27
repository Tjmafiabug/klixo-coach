import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStaffAttendanceBoard } from "@/lib/data";
import { dayLabel } from "@/lib/format";
import { PageHeader } from "@/components/page";
import { Banner, fieldClass } from "@/components/ui";
import StaffAttendanceGrid from "./StaffAttendanceGrid";

export const dynamic = "force-dynamic";

const STAT = [
  { key: "present", label: "Present", cls: "text-success" },
  { key: "absent", label: "Absent", cls: "text-danger" },
  { key: "leave", label: "Leave", cls: "text-brand" },
  { key: "half_day", label: "Half-day", cls: "text-warning" },
  { key: "unmarked", label: "Unmarked", cls: "text-muted-foreground" },
] as const;

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sp = await searchParams;
  const board = await getStaffAttendanceBoard(sp.date ?? "");

  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage/staff"
        backLabel="Staff"
        title="Staff attendance"
        subtitle="Mark present · absent · leave · half-day"
      />

      {/* Date nav + jump */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/manage/staff/attendance?date=${board.prev}`} className={navBtn} aria-label="Previous day">
            ←
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums text-foreground">
            {dayLabel(board.date)}
          </span>
          <Link href={`/manage/staff/attendance?date=${board.next}`} className={navBtn} aria-label="Next day">
            →
          </Link>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={board.date}
            className={`${fieldClass} h-9 w-auto`}
          />
          <button className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
            Go
          </button>
        </form>
      </div>

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Attendance saved.</Banner>
        </div>
      ) : null}

      {board.isFuture ? (
        <p className="mt-4 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-warning">
          This day is in the future — you can record planned leave in advance.
        </p>
      ) : null}

      {/* summary */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium tabular-nums">
        {STAT.map((s) => (
          <span key={s.key} className={s.cls}>
            {board.summary[s.key]} {s.label}
          </span>
        ))}
      </div>

      {board.rows.length === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            No active staff to mark.
          </p>
        </div>
      ) : (
        <StaffAttendanceGrid date={board.date} rows={board.rows} />
      )}
    </div>
  );
}
