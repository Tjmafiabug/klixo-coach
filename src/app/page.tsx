import Link from "next/link";
import { Wordmark } from "@/components/Logo";

const FEATURES: [string, string][] = [
  ["Today's batches", "Each teacher sees only their sessions for today, in the centre's timezone."],
  ["One-tap marking", "Default everyone present, tap absent or late, submit. Under a minute per batch."],
  ["Owner dashboard", "Attendance %, defaulters below threshold, and a full manual-mark audit."],
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark size={28} />
        <Link
          href="/login"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Coaching ERP
        </span>
        <h1 className="mt-5 max-w-2xl text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Attendance &amp; timetable, without the spreadsheet chaos.
        </h1>
        <p className="mt-4 max-w-xl text-balance text-lg text-muted-foreground">
          Teachers mark the batch in seconds. Owners get the numbers that matter.
          One clean app per coaching centre.
        </p>

        <div className="mt-7 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-brand px-6 py-3 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            Open the app
          </Link>
          {/* Demo only. Publishing a working PIN next to the login link is fine
              while the Sheet holds fake data and harmful the moment it doesn't,
              so it's opt-in: set DEMO_MODE=1 on demo deployments, never on a
              real centre's. */}
          {process.env.DEMO_MODE === "1" && (
            <span className="text-sm text-muted-foreground">
              Demo PIN <span className="font-semibold text-foreground">1234</span>
            </span>
          )}
        </div>

        <ul className="mt-14 grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <li
              key={title}
              className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <p className="font-semibold text-foreground">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-center text-xs text-muted-foreground">
        Phase&nbsp;0 — MVP. Backend: Google Sheets via service account.
      </footer>
    </div>
  );
}
