import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBatches } from "@/lib/data";
import { ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, RowChevron } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [batches, sp] = await Promise.all([listBatches(), searchParams]);
  const active = batches.filter((b) => b.active).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Batches"
        subtitle={`${active} active · ${batches.length} total`}
        actions={<PrimaryLink href="/manage/batches/new">+ Add batch</PrimaryLink>}
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Batch saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {batches.map((b, i) => (
          <Reveal key={b.batch_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
            <li className="h-full">
              <Link
                href={`/manage/batches/${b.batch_id}`}
                className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{b.name}</p>
                    {!b.active ? <ActiveChip active={false} /> : null}
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
        ))}
      </ul>
    </div>
  );
}
