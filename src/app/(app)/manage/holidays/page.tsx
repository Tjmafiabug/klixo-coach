import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listHolidays, effectiveToday } from "@/lib/data";
import { saveHoliday, deleteHolidayAction } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [holidays, today, sp] = await Promise.all([
    listHolidays(),
    effectiveToday(),
    searchParams,
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Holidays</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generation skips these dates; adding one removes its future unmarked sessions.
      </p>

      <div className="mt-4 space-y-3">
        {sp.saved ? <Banner tone="success">Holiday added — schedule regenerated.</Banner> : null}
        {sp.deleted ? <Banner tone="success">Holiday removed — schedule regenerated.</Banner> : null}
        {sp.error === "missing" ? <Banner tone="danger">Pick a date and enter a name.</Banner> : null}
      </div>

      <form
        action={saveHoliday}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <label className="w-44">
          <span className="text-sm font-medium">Date</span>
          <input type="date" name="date" defaultValue={today} className={fieldClass} />
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-medium">Name</span>
          <input name="name" placeholder="Independence Day" className={fieldClass} />
        </label>
        <div className="w-32">
          <SubmitButton pendingText="Adding…">+ Add</SubmitButton>
        </div>
      </form>

      {holidays.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No holidays yet.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {holidays.map((h) => (
            <li
              key={h.date}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
            >
              <div>
                <p className="font-semibold text-foreground">{h.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{h.date}</p>
              </div>
              <form action={deleteHolidayAction}>
                <input type="hidden" name="date" value={h.date} />
                <button className="h-9 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
