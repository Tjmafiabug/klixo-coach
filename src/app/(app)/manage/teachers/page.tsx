import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTeachers } from "@/lib/data";
import { paginate } from "@/lib/format";
import { Avatar, RoleChip, ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron, SearchBox, Pager } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string; page?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [teachers, sp] = await Promise.all([listTeachers(), searchParams]);

  const q = (sp.q ?? "").trim();
  const ql = q.toLowerCase();
  const matches = q
    ? teachers.filter(
        (t) =>
          t.name.toLowerCase().includes(ql) ||
          t.subjects.toLowerCase().includes(ql) ||
          t.batchNames.some((n) => n.toLowerCase().includes(ql)),
      )
    : teachers;
  const { slice, page, pages, total, start, size } = paginate(matches, Number(sp.page));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Teachers"
        subtitle={`${teachers.length} staff`}
        actions={
          <>
            <SearchBox action="/manage/teachers" placeholder="Search teachers…" defaultValue={q} />
            <PrimaryLink href="/manage/teachers/new">+ Add teacher</PrimaryLink>
          </>
        }
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Teacher saved.</Banner>
        </div>
      ) : null}

      {total === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {q ? `No teachers match “${q}”.` : "No teachers yet."}
          </p>
        </div>
      ) : (
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((t, i) => (
          <Reveal key={t.teacher_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
            <li className="h-full">
              <Link
                href={`/manage/teachers/${t.teacher_id}`}
                className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <Avatar name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{t.name}</p>
                    <RoleChip role={t.role} />
                    {!t.active ? <ActiveChip active={false} /> : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                    {t.phone} · {t.subjects || "—"}
                    {t.hasPin ? "" : " · no PIN"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.batchNames.length > 0 ? t.batchNames.join(", ") : "No batches"}
                  </p>
                </div>
                <RowChevron />
              </Link>
            </li>
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
        baseHref="/manage/teachers"
        params={{ q: q || undefined }}
      />
    </div>
  );
}
