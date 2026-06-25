// Presentational date formatting (UTC-stable). These format an already-correct
// ISO date for display only — they are NOT the centre-timezone business clock,
// which lives in time.ts. Safe to import from both server and client components.

/** ISO date "YYYY-MM-DD" → "26 Jun" (UTC, locale-stable). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
