import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRule, getFormOptions, effectiveToday } from "@/lib/data";
import { expireRuleAction } from "@/lib/actions";
import { RuleForm } from "../RuleForm";

export const dynamic = "force-dynamic";

function errorText(error?: string, withWhat?: string) {
  if (error === "clash")
    return `Clash: ${withWhat ?? "a resource"} is already booked at that time. Change the day/time/room/teacher.`;
  if (error === "time") return "End time must be after start time.";
  if (error === "range") return "Effective-to date can't be before effective-from.";
  if (error === "missing") return "Pick a batch, at least one day, times, room, teacher and a start date.";
  return null;
}

export default async function EditRulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ error?: string; with?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const { slotId } = await params;
  const [rule, options, today, sp] = await Promise.all([
    getRule(slotId),
    getFormOptions(),
    effectiveToday(),
    searchParams,
  ]);
  if (!rule) notFound();
  const err = errorText(sp.error, sp.with);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/timetable" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Timetable
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Edit rule</h2>
      <p className="mt-1 text-sm text-muted-foreground">{slotId}</p>
      {err ? (
        <p className="mt-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">{err}</p>
      ) : null}

      <RuleForm options={options} today={today} rule={rule} />

      <form action={expireRuleAction} className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">End this rule</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Stops generating after the date below; future unmarked sessions are removed,
          past and marked ones kept.
        </p>
        <input type="hidden" name="slotId" value={slotId} />
        <div className="mt-2 flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-xs font-medium">Last active date</span>
            <input
              type="date"
              name="effectiveTo"
              defaultValue={today}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button className="h-10 cursor-pointer rounded-lg border border-danger/30 bg-danger-subtle px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10">
            End rule
          </button>
        </div>
      </form>
    </main>
  );
}
