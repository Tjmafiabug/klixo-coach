import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listRooms } from "@/lib/data";
import { saveRoom } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reveal } from "@/components/motion";
import { PageHeader, RowChevron } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [rooms, sp] = await Promise.all([listRooms(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Rooms"
        subtitle={`${rooms.length} rooms`}
      />

      <div className="mt-4 space-y-3">
        {sp.saved ? <Banner tone="success">Room saved.</Banner> : null}
        {sp.deleted ? <Banner tone="success">Room deleted.</Banner> : null}
        {sp.error === "missing" ? (
          <Banner tone="danger">Enter a name and a numeric capacity.</Banner>
        ) : null}
      </div>

      <form
        action={saveRoom}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-medium">Room name</span>
          <input
            name="name"
            placeholder="Room D"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>
        <label className="w-28">
          <span className="text-sm font-medium">Capacity</span>
          <input
            name="capacity"
            inputMode="numeric"
            placeholder="30"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>
        <div className="w-32">
          <SubmitButton pendingText="Adding…">+ Add room</SubmitButton>
        </div>
      </form>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rooms.map((r, i) => (
          <Reveal key={r.room_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
            <li className="h-full">
              <Link
                href={`/manage/rooms/${r.room_id}`}
                className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{r.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                    Capacity {r.capacity} · {r.inUse} in use
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
