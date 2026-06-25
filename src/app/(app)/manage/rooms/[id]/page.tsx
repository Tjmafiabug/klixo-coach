import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRoom, roomUsage } from "@/lib/data";
import { saveRoom, deleteRoomAction } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function EditRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { id } = await params;
  const [room, usage, sp] = await Promise.all([getRoom(id), roomUsage(id), searchParams]);
  if (!room) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/rooms" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Rooms
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Edit room</h2>
      <p className="mt-1 text-sm text-muted-foreground">{room.room_id}</p>

      <div className="mt-3 space-y-3">
        {sp.error === "missing" ? <Banner tone="danger">Enter a name and a numeric capacity.</Banner> : null}
        {sp.error === "inuse" ? (
          <Banner tone="danger">
            This room is used by {usage} batch{usage === 1 ? "" : "es"}/rule{usage === 1 ? "" : "s"}.
            Reassign them before deleting.
          </Banner>
        ) : null}
      </div>

      <form
        action={saveRoom}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="roomId" value={room.room_id} />
        <label className="block">
          <span className="text-sm font-medium">Room name</span>
          <input name="name" defaultValue={room.name} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Capacity</span>
          <input name="capacity" inputMode="numeric" defaultValue={room.capacity} className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <form action={deleteRoomAction} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Delete room</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Only allowed when no active batch or timetable rule uses it.
        </p>
        <input type="hidden" name="roomId" value={room.room_id} />
        <button className="mt-2 h-10 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
          Delete room
        </button>
      </form>
    </main>
  );
}
