import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-black/50 dark:border-white/15 dark:text-white/50">
          Coaching ERP
        </span>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          KLiXO <span className="text-indigo-600">Coach</span>
        </h1>
        <p className="max-w-md text-balance text-black/60 dark:text-white/60">
          Attendance &amp; timetable for coaching centres. Teachers mark the
          batch, owners see the numbers. One app per centre.
        </p>
      </div>

      <ul className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {[
          ["Today's batches", "Local-timezone session list, ready to mark"],
          ["One-tap marking", "Default present, tap absent / late, submit"],
          ["Owner dashboard", "Attendance %, defaulters, manual-mark audit"],
        ].map(([title, body]) => (
          <li
            key={title}
            className="rounded-xl border border-black/10 p-4 text-left dark:border-white/15"
          >
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm text-black/55 dark:text-white/55">{body}</p>
          </li>
        ))}
      </ul>

      <Link
        href="/login"
        className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Open the app
      </Link>

      <p className="text-xs text-black/40 dark:text-white/40">
        Phase&nbsp;0 — MVP. Backend: Google Sheets via service account.
      </p>
    </main>
  );
}
