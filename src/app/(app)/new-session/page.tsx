import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFormOptions, effectiveToday, weekStartOf } from "@/lib/data";
import { NewSessionForm } from "./NewSessionForm";

export const dynamic = "force-dynamic";

const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s?: string) => !!s && /^\d{2}:\d{2}$/.test(s);

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    with?: string;
    date?: string;
    start?: string;
    end?: string;
    batch?: string;
    teacher?: string;
    room?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today"); // scheduling is owner-only
  const [options, today, sp] = await Promise.all([
    getFormOptions(),
    effectiveToday(),
    searchParams,
  ]);

  const errorMsg =
    sp.error === "clash"
      ? `Clash: this ${sp.with ?? "resource"} is already booked at that time. Pick another time/room/teacher.`
      : sp.error === "time"
        ? "End time must be after start time."
        : sp.error === "past"
          ? "Can't create a class in the past."
          : sp.error === "missing"
            ? "Fill in every field."
            : null;

  // Prefill from a click on an empty calendar slot. Validate against known
  // values so a hand-edited query string can't inject junk.
  const fromCalendar = isISO(sp.date);
  const initial = {
    date: fromCalendar ? sp.date : undefined,
    start: isTime(sp.start) ? sp.start : undefined,
    end: isTime(sp.end) ? sp.end : undefined,
    batchId: options.batches.some((b) => b.id === sp.batch) ? sp.batch : undefined,
    teacherId: options.teachers.some((t) => t.id === sp.teacher) ? sp.teacher : undefined,
    roomId: options.rooms.some((r) => r.id === sp.room) ? sp.room : undefined,
    // Return to the calendar week we came from after a successful add.
    returnTo: fromCalendar ? `/timetable?week=${weekStartOf(sp.date!)}` : undefined,
  };

  const back = fromCalendar
    ? { href: initial.returnTo!, label: "Timetable" }
    : { href: "/today", label: "Today" };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 3.5 5.5 8l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {back.label}
      </Link>

      <h2 className="mt-3 text-xl font-bold tracking-tight">Add extra class</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Unplanned / make-up session. It becomes markable straight away.
      </p>

      {errorMsg ? (
        <p className="mt-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">
          {errorMsg}
        </p>
      ) : null}

      <NewSessionForm options={options} today={today} initial={initial} />
    </main>
  );
}
