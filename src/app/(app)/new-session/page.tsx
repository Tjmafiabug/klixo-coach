import Link from "next/link";
import { getFormOptions, effectiveToday } from "@/lib/data";
import { NewSessionForm } from "./NewSessionForm";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const [options, today] = await Promise.all([getFormOptions(), effectiveToday()]);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href="/today"
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
        Today
      </Link>

      <h1 className="mt-3 text-xl font-bold tracking-tight">Add extra class</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Unplanned / make-up session. It becomes markable straight away.
      </p>

      <NewSessionForm options={options} today={today} />
    </main>
  );
}
