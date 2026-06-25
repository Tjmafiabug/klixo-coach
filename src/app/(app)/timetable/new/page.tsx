import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFormOptions, effectiveToday } from "@/lib/data";
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

export default async function NewRulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; with?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [options, today, sp] = await Promise.all([
    getFormOptions(),
    effectiveToday(),
    searchParams,
  ]);
  const err = errorText(sp.error, sp.with);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/timetable" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Timetable
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Add timetable rule</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A recurring weekly slot. Sessions are generated from it.
      </p>
      {err ? (
        <p className="mt-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">{err}</p>
      ) : null}
      <RuleForm options={options} today={today} />
    </main>
  );
}
