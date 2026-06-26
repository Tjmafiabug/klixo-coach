import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimetableView } from "@/lib/data";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink } from "@/components/page";
import { CalendarGrid } from "./CalendarGrid";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; expired?: string; warn?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [{ rules, clashes }, sp] = await Promise.all([
    getTimetableView(),
    searchParams,
  ]);

  const notice = sp.saved ? "Timetable saved." : sp.expired ? "Rule expired." : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Timetable"
        subtitle={`Weekly recurring rules · ${rules.length} slots`}
        actions={<PrimaryLink href="/timetable/new">+ Add rule</PrimaryLink>}
      />

      {notice ? (
        <p className="mt-4 rounded-xl border border-success/20 bg-success-subtle px-3 py-2.5 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {sp.warn === "student" ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-subtle px-3 py-2.5 text-sm font-medium text-warning">
          Saved with a student clash (two classes overlap for some students).
        </p>
      ) : null}

      <Reveal delay={0.05}>
        {clashes.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-subtle p-4">
            <p className="text-sm font-semibold text-danger">
              {clashes.length} schedule clash{clashes.length === 1 ? "" : "es"} detected
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-danger/90">
              {clashes.slice(0, 6).map((c, i) => (
                <li key={i}>
                  <span className="font-semibold uppercase">{c.type}</span> · {c.date}: {c.a} ↔ {c.b}
                </li>
              ))}
              {clashes.length > 6 ? <li>…and {clashes.length - 6} more</li> : null}
            </ul>
          </div>
        ) : (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/25 bg-success-subtle px-4 py-2 text-sm font-medium text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            No clashes — schedule is healthy.
          </p>
        )}
      </Reveal>

      <Reveal delay={0.1}>
        <CalendarGrid rules={rules} />
      </Reveal>
    </div>
  );
}
