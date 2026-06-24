import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { Avatar, ActiveChip, Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [students, sp] = await Promise.all([listStudents(), searchParams]);
  const active = students.filter((s) => s.active).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active} active · {students.length} total
          </p>
        </div>
        <Link
          href="/manage/students/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          + Add student
        </Link>
      </div>

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Student saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-col gap-2.5">
        {students.map((s) => (
          <li key={s.student_id}>
            <Link
              href={`/manage/students/${s.student_id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
            >
              <Avatar name={s.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{s.name}</p>
                  {!s.active ? <ActiveChip active={false} /> : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                  Joined {s.join_date} · {s.batchCount} batch{s.batchCount === 1 ? "" : "es"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-brand">View</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
