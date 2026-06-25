import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { Avatar, ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [students, sp] = await Promise.all([listStudents(), searchParams]);
  const active = students.filter((s) => s.active).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Students"
        subtitle={`${active} active · ${students.length} total`}
        actions={<PrimaryLink href="/manage/students/new">+ Add student</PrimaryLink>}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Student saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {students.map((s, i) => (
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
    </div>
  );
}
