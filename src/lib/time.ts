// CRITICAL (PLAN.md §11): "today" / day-of-week are computed in the centre's
// LOCAL timezone (CENTER_TZ), never the server's UTC clock.

function tz(): string {
  return process.env.CENTER_TZ ?? "Asia/Kolkata";
}

/** Today's date as YYYY-MM-DD in the centre's timezone. */
export function centerToday(d = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Day-of-week (Mon..Sun) in the centre's timezone — matches Timetable.day_of_week. */
export function centerDow(d = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz(),
    weekday: "short",
  }).format(d);
}

/** Wall-clock timestamp in the centre's timezone, with offset, e.g. 2026-06-24T17:05:09+05:30. */
export function centerTimestamp(d = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const offset = (parts.timeZoneName ?? "GMT+00:00").replace("GMT", "") || "+00:00";
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${offset}`;
}
