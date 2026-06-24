import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getManageCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");

  const c = await getManageCounts();

  const cards = [
    { href: "/manage/students", title: "Students", sub: `${c.studentsActive} active · ${c.studentsTotal} total` },
    { href: "/manage/batches", title: "Batches", sub: `${c.batchesActive} active · ${c.batchesTotal} total` },
    { href: "/manage/teachers", title: "Teachers", sub: `${c.teachersActive} active staff` },
    { href: "/timetable", title: "Timetable", sub: `${c.rules} recurring rules` },
    { href: "/manage/rooms", title: "Rooms", sub: `${c.rooms} rooms` },
    { href: "/manage/holidays", title: "Holidays", sub: `${c.holidays} dates` },
    { href: "/manage/settings", title: "Settings", sub: "Name · threshold · branding" },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Manage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Run the centre without touching the spreadsheet.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{c.title}</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">{c.sub}</p>
            </div>
            <span aria-hidden className="shrink-0 text-lg text-muted-foreground">›</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
