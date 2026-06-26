// Presentational date formatting (UTC-stable). These format an already-correct
// ISO date for display only — they are NOT the centre-timezone business clock,
// which lives in time.ts. Safe to import from both server and client components.

/**
 * Format a rupee amount for display. Pure: no side effects, safe on server and
 * client. Uses en-IN locale so thousands are grouped as per Indian convention
 * (1,00,000 not 100,000). Fractional paise are truncated — fees are whole rupees.
 */
export function rupees(n: string | number): string {
  const num = typeof n === "string" ? (parseInt(n, 10) || 0) : n;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

/** ISO date "YYYY-MM-DD" → "26 Jun" (UTC, locale-stable). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
