import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listHolidays, effectiveToday } from "@/lib/data";
import { saveHoliday, deleteHolidayAction } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reveal } from "@/components/motion";
import { PageHeader, FilterTabs } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; filter?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [holidays, today, sp] = await Promise.all([
    listHolidays(),
    effectiveToday(),
    searchParams,
  ]);

  // Upcoming is what an owner acts on — a past holiday is a record, and the
  // list grows by a year every year.
  const filter = sp.filter === "upcoming" || sp.filter === "past" ? sp.filter : undefined;
  const shown =
    filter === "upcoming" ? holidays.filter((h) => h.date >= today)
    : filter === "past" ? holidays.filter((h) => h.date < today)
    : holidays;
  const upcomingCount = holidays.filter((h) => h.date >= today).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Holidays"
        subtitle="Generation skips these dates; adding one removes its future unmarked sessions."
      />

      <div className="mt-4 space-y-3">
        {sp.saved ? (
          <Banner tone="success">Holiday added — schedule regenerated.</Banner>
        ) : null}
        {sp.deleted ? (
          <Banner tone="success">Holiday removed — schedule regenerated.</Banner>
        ) : null}
        {sp.error === "missing" ? (
          <Banner tone="danger">Pick a date and enter a name.</Banner>
        ) : null}
      </div>

      <form
        action={saveHoliday}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <label className="w-full sm:w-44">
          <span className="text-sm font-medium">Date</span>
          <input type="date" name="date" defaultValue={today} className={fieldClass} />
        </label>
        <label className="w-full sm:min-w-[10rem] sm:flex-1">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            placeholder="Independence Day"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>
        <div className="w-full sm:w-32">
          <SubmitButton pendingText="Adding…">+ Add</SubmitButton>
        </div>
      </form>

      <FilterTabs
        filters={[
          { label: "All", count: holidays.length },
          { key: "upcoming", label: "Upcoming", count: upcomingCount },
          { key: "past", label: "Past", count: holidays.length - upcomingCount },
        ]}
        active={filter}
        baseHref="/manage/holidays"
      />

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No holidays yet.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((h, i) => (
            <Reveal key={h.date} delay={Math.min(i * 0.03, 0.3)} className="h-full">
              <li className="flex h-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{h.name}</p>
                  <p className="mt-0.5 font-mono text-sm text-muted-foreground tabular-nums">
                    {h.date}
                  </p>
                </div>
                <form action={deleteHolidayAction}>
                  <input type="hidden" name="date" value={h.date} />
                  <button className="h-10 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 active:scale-[0.98]">
                    Remove
                  </button>
                </form>
              </li>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
