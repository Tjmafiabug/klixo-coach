import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTeachers } from "@/lib/data";
import { Avatar, RoleChip, ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [teachers, sp] = await Promise.all([listTeachers(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Teachers"
        subtitle={`${teachers.length} staff`}
        actions={<PrimaryLink href="/manage/teachers/new">+ Add teacher</PrimaryLink>}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Teacher saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.map((t, i) => (
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
    </div>
  );
}
