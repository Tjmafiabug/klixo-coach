import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBatches } from "@/lib/data";
import { ActiveChip, Banner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [batches, sp] = await Promise.all([listBatches(), searchParams]);
  const active = batches.filter((b) => b.active).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active} active · {batches.length} total
          </p>
        </div>
        <Link
          href="/manage/batches/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          + Add batch
        </Link>
      </div>

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Batch saved.</Banner>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-col gap-2.5">
        {batches.map((b) => (
          <li key={b.batch_id}>
            <Link
              href={`/manage/batches/${b.batch_id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
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
                  {b.enrolled} enrolled{b.fee ? ` · ₹${b.fee}` : ""}{b.level ? ` · ${b.level}` : ""}
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
