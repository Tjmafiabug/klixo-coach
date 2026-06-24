import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTeachers } from "@/lib/data";
import { Avatar, RoleChip, ActiveChip, Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [teachers, sp] = await Promise.all([listTeachers(), searchParams]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teachers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{teachers.length} staff</p>
        </div>
        <Link
          href="/manage/teachers/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          + Add teacher
        </Link>
      </div>

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Teacher saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-col gap-2.5">
        {teachers.map((t) => (
          <li key={t.teacher_id}>
            <Link
              href={`/manage/teachers/${t.teacher_id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
            >
              <Avatar name={t.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{t.name}</p>
                  <RoleChip role={t.role} />
                  {!t.active ? <ActiveChip active={false} /> : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                  {t.phone} · {t.subjects || "—"} · {t.batchCount} batch{t.batchCount === 1 ? "" : "es"}
                  {t.hasPin ? "" : " · no PIN"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-brand">Edit</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
