import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listStudents, getOwnerDashboard } from "@/lib/data";
import { paginate } from "@/lib/format";
import { Avatar, ActiveChip, Banner, PctBadge } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron, SearchBox, Pager, FilterTabs } from "@/components/page";

export const dynamic = "force-dynamic";

const FILTERS: { key?: string; label: string }[] = [
  { key: undefined, label: "All students" },
  { key: "defaulters", label: "Below minimum" },
  { key: "followups", label: "Absence streak" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string; page?: string; filter?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [students, sp] = await Promise.all([listStudents(), searchParams]);
  const active = students.filter((s) => s.active).length;

  // Attendance-based filters need the dashboard's stats. Both read through the
  // same per-request batchGet (sheets.ts readTab), so this costs no extra
  // Sheets round-trip — and only runs when such a filter is actually asked for.
  const filter = sp.filter === "defaulters" || sp.filter === "followups" ? sp.filter : undefined;
  const stats = filter ? (await getOwnerDashboard()).stats : null;

  const q = (sp.q ?? "").trim();
  let matches = q
    ? students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : students;

  let filterLabel: string | null = null;
  if (stats && filter === "defaulters") {
    const ids = new Set(stats.defaulters.map((d) => d.id));
    matches = matches.filter((s) => ids.has(s.student_id));
    filterLabel = `Below ${stats.threshold}% attendance`;
  } else if (stats && filter === "followups") {
    const ids = new Set(stats.followups.map((f) => f.id));
    matches = matches.filter((s) => ids.has(s.student_id));
    filterLabel = `${stats.followupStreak}+ absences in a row`;
  }

  // Attendance % per student, so a filtered list shows the number it filtered on
  // rather than making the owner open each card to find it.
  const pctById = new Map<string, number>();
  if (stats) {
    for (const d of stats.defaulters) pctById.set(d.id, d.pct);
  }
  const streakById = new Map<string, number>();
  if (stats) {
    for (const f of stats.followups) streakById.set(f.id, f.streak);
  }

  const { slice, page, pages, total, start, size } = paginate(matches, Number(sp.page));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Students"
        subtitle={`${active} active · ${students.length} total`}
        actions={
          <>
            <SearchBox action="/manage/students" placeholder="Search students…" defaultValue={q} />
            <PrimaryLink href="/manage/students/new">+ Add student</PrimaryLink>
          </>
        }
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Student saved.</Banner>
        </div>
      ) : null}

      <FilterTabs
        filters={FILTERS}
        active={filter}
        baseHref="/manage/students"
        params={{ q: q || undefined }}
      />
      {filterLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">{filterLabel}</p>
      ) : null}

      {total === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {q
              ? `No students match “${q}”.`
              : filterLabel
                ? `No students ${filter === "followups" ? "on an absence streak" : "below the attendance minimum"}.`
                : "No students yet."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slice.map((s, i) => (
            <Reveal key={s.student_id} delay={Math.min(i * 0.03, 0.3)} as="li" className="h-full">
                <Link
                  href={`/manage/students/${s.student_id}`}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
                >
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{s.name}</p>
                      {!s.active ? <ActiveChip active={false} /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                      Joined {s.join_date} · {s.batchCount} batch
                      {s.batchCount === 1 ? "" : "es"}
                    </p>
                  </div>
                  {/* Show what the list was filtered on, so the owner does not
                      have to open each card to see the number. */}
                  {filter === "defaulters" && pctById.has(s.student_id) ? (
                    <PctBadge pct={pctById.get(s.student_id)!} threshold={stats!.threshold} />
                  ) : filter === "followups" && streakById.has(s.student_id) ? (
                    <span className="shrink-0 rounded-full bg-danger-subtle px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-danger">
                      {streakById.get(s.student_id)}×
                    </span>
                  ) : null}
                  <RowChevron />
                </Link>
            </Reveal>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        pages={pages}
        total={total}
        start={start}
        size={size}
        baseHref="/manage/students"
        params={{ q: q || undefined, filter }}
      />
    </div>
  );
}
