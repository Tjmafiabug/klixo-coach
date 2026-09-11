import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBatches, effectiveToday } from "@/lib/data";
import { paginate } from "@/lib/format";
import { ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron, SearchBox, Pager, FilterTabs } from "@/components/page";

export const dynamic = "force-dynamic";

const daysBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string; page?: string; filter?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [batches, today, sp] = await Promise.all([
    listBatches(),
    effectiveToday(),
    searchParams,
  ]);
  const active = batches.filter((b) => b.active).length;

  const q = (sp.q ?? "").trim();
  const ql = q.toLowerCase();
  const matches = q
    ? batches.filter(
        (b) =>
          b.name.toLowerCase().includes(ql) ||
          b.subject.toLowerCase().includes(ql) ||
          b.teacherName.toLowerCase().includes(ql),
      )
    : batches;

  // Active/inactive is the split an owner actually works in, and "empty" catches
  // the batch that exists but nobody is enrolled in — a scheduling mistake that
  // otherwise hides in a long roster.
  const filter = ["active", "inactive", "empty"].includes(sp.filter ?? "") ? sp.filter : undefined;
  const filtered =
    filter === "active" ? matches.filter((b) => b.active)
    : filter === "inactive" ? matches.filter((b) => !b.active)
    : filter === "empty" ? matches.filter((b) => b.active && b.enrolled === 0)
    : matches;

  const counts = {
    all: matches.length,
    active: matches.filter((b) => b.active).length,
    inactive: matches.filter((b) => !b.active).length,
    empty: matches.filter((b) => b.active && b.enrolled === 0).length,
  };

  const { slice, page, pages, total, start, size } = paginate(filtered, Number(sp.page));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Batches"
        subtitle={`${active} active · ${batches.length} total`}
        actions={
          <>
            <SearchBox action="/manage/batches" placeholder="Search batches…" defaultValue={q} />
            <PrimaryLink href="/manage/batches/new">+ Add batch</PrimaryLink>
          </>
        }
      />

      <FilterTabs
        filters={[
          { label: "All", count: counts.all },
          { key: "active", label: "Active", count: counts.active },
          { key: "inactive", label: "Inactive", count: counts.inactive },
          { key: "empty", label: "No students", count: counts.empty },
        ]}
        active={filter}
        baseHref="/manage/batches"
        params={{ q: q || undefined }}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Batch saved.</Banner>
        </div>
      ) : null}

      {total === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {q
              ? `No batches match “${q}”.`
              : filter === "empty"
                ? "Every active batch has students enrolled."
                : filter === "inactive"
                  ? "No inactive batches."
                  : filter === "active"
                    ? "No active batches."
                    : "No batches yet."}
          </p>
        </div>
      ) : (
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((b, i) => {
          const dleft = b.expected_end_date ? daysBetween(today, b.expected_end_date) : null;
          const endChip =
            dleft === null ? null : dleft < 0 ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                ended
              </span>
            ) : dleft <= 14 ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-warning/25 bg-warning-subtle px-2 py-0.5 text-[0.65rem] font-semibold text-warning">
                ends in {dleft}d
              </span>
            ) : null;
          return (
          <Reveal key={b.batch_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
            <li className="h-full">
              <Link
                href={`/manage/batches/${b.batch_id}`}
                className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{b.name}</p>
                    {!b.active ? <ActiveChip active={false} /> : null}
                    {endChip}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {b.subject} · {b.teacherName} · {b.roomName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {b.enrolled} enrolled{b.fee ? ` · ₹${b.fee}` : ""}
                    {b.level ? ` · ${b.level}` : ""}
                  </p>
                </div>
                <RowChevron />
              </Link>
            </li>
          </Reveal>
          );
        })}
      </ul>
      )}

      <Pager
        page={page}
        pages={pages}
        total={total}
        start={start}
        size={size}
        baseHref="/manage/batches"
        params={{ q: q || undefined, filter }}
      />
    </div>
  );
}
