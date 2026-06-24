import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCenterConfig } from "@/lib/data";
import { saveSettings } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function errorText(e?: string) {
  if (e === "missing") return "Centre name is required.";
  if (e === "threshold") return "Attendance threshold must be a whole number 0–100.";
  if (e === "buffer") return "Room changeover buffer must be a whole number of minutes.";
  return null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = (await getSession())!;
  if (user.role !== "owner") redirect("/today");
  const [cfg, sp] = await Promise.all([getCenterConfig(), searchParams]);
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Manage
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Centre name, threshold and branding.</p>

      <div className="mt-4 space-y-3">
        {sp.saved ? <Banner tone="success">Settings saved.</Banner> : null}
        {err ? <Banner tone="danger">{err}</Banner> : null}
      </div>

      <form
        action={saveSettings}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="text-sm font-medium">Centre name</span>
          <input name="centerName" defaultValue={cfg.center_name} className={fieldClass} />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Attendance threshold (%)</span>
            <input name="threshold" inputMode="numeric" defaultValue={cfg.attendance_threshold} className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Changeover buffer (min)</span>
            <input name="buffer" inputMode="numeric" defaultValue={cfg.room_changeover_buffer_min} className={fieldClass} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Week starts on</span>
            <select name="weekStart" defaultValue={cfg.week_start} className={`${fieldClass} cursor-pointer`}>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Timezone</span>
            <input name="timezone" defaultValue={cfg.timezone} className={fieldClass} />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Timezone here is informational; the live clock uses the <code>CENTER_TZ</code> env var.
        </p>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Logo URL <span className="text-muted-foreground">(optional)</span>
          </span>
          <input name="logoUrl" defaultValue={cfg.logo_url} placeholder="https://…" className={fieldClass} />
        </label>

        <div className="mt-4">
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </form>
    </main>
  );
}
