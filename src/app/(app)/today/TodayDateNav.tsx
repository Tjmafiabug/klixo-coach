"use client";

import { useRouter } from "next/navigation";

function shift(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function TodayDateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? "/today" : `/today?date=${d}`);
  const atToday = date >= today;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => go(shift(date, -1))}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      <button
        type="button"
        aria-label="Next day"
        disabled={atToday}
        onClick={() => go(shift(date, 1))}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        ›
      </button>
      {date !== today ? (
        <button
          type="button"
          onClick={() => go(today)}
          className="ml-1 h-9 cursor-pointer rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}
