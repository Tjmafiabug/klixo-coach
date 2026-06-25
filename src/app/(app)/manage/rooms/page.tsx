import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listRooms } from "@/lib/data";
import { saveRoom } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [rooms, sp] = await Promise.all([listRooms(), searchParams]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Rooms</h1>
      <p className="mt-1 text-sm text-muted-foreground">{rooms.length} rooms</p>

      <div className="mt-4 space-y-3">
        {sp.saved ? <Banner tone="success">Room saved.</Banner> : null}
        {sp.deleted ? <Banner tone="success">Room deleted.</Banner> : null}
        {sp.error === "missing" ? <Banner tone="danger">Enter a name and a numeric capacity.</Banner> : null}
      </div>

      <form
        action={saveRoom}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-medium">Room name</span>
          <input name="name" placeholder="Room D" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="w-28">
          <span className="text-sm font-medium">Capacity</span>
          <input name="capacity" inputMode="numeric" placeholder="30" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <div className="w-32">
          <SubmitButton pendingText="Adding…">+ Add room</SubmitButton>
        </div>
      </form>

      <ul className="mt-5 flex flex-col gap-2.5">
        {rooms.map((r) => (
          <li key={r.room_id}>
            <Link
              href={`/manage/rooms/${r.room_id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
            >
              <div>
                <p className="font-semibold text-foreground">{r.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                  Capacity {r.capacity} · {r.inUse} in use
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
