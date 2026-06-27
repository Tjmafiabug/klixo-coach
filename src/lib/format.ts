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

/** ISO date "YYYY-MM-DD" → "Sat, 26 Jun" (UTC, locale-stable). */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** A wa.me link for a phone (bare 10-digit numbers get the +91 India prefix).
 *  Returns null when there are no digits, so callers can hide the action. */
export function waLink(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
}

export interface Page<T> {
  slice: T[];
  page: number; // clamped 1-based current page
  pages: number;
  total: number;
  start: number; // 0-based index of the first item on this page
  size: number;
}

/** Slice an already-loaded array to one page. Clamps `page` into [1, pages] so a
 *  junk/out-of-range ?page never errors. Render-only — the whole list is already
 *  in memory (the Sheet tab is read in full), so this bounds the DOM, not reads. */
export function paginate<T>(items: T[], page: number, size = 24): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(Math.max(1, page || 1), pages);
  const start = (cur - 1) * size;
  return { slice: items.slice(start, start + size), page: cur, pages, total, start, size };
}
