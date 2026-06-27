import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { paginate } from "@/lib/format";
import { Avatar, ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron, SearchBox, Pager } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string; page?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [students, sp] = await Promise.all([listStudents(), searchParams]);
  const active = students.filter((s) => s.active).length;

  const q = (sp.q ?? "").trim();
  const matches = q
    ? students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : students;
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

      {total === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {q ? `No students match “${q}”.` : "No students yet."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slice.map((s, i) => (
            <Reveal key={s.student_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
              <li className="h-full">
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
        baseHref="/manage/students"
        params={{ q: q || undefined }}
      />
    </div>
  );
}
