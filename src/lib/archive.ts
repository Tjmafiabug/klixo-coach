import "server-only";
import {
  appendRows,
  archiveTabName,
  deleteRows,
  ensureTab,
  invalidateArchiveCache,
  rawRows,
  type ArchivableTab,
} from "@/lib/sheets";

/**
 * Moving rows out of a hot tab and into its archive.
 *
 * The hard part is not deciding what to move — that is a date comparison — it
 * is that Sheets has no transaction and no compare-and-swap, so "copy then
 * delete" can be interrupted anywhere, and the delete itself is positional: it
 * shifts every row below it. A human sorting the tab mid-run, or the app
 * appending to it, both land inside that window.
 *
 * The design that survives all of it:
 *
 *   1. Copy first, delete second. An interruption between them leaves rows in
 *      both tabs, which readers already tolerate — every consumer resolves
 *      (session, student) to the newest row, and sessionsSince dedupes by id.
 *      The reverse order would lose rows outright.
 *   2. Identity is the whole row tuple with multiplicity, never the id. log_id
 *      is not unique (legacy counter rows collide) and exact-duplicate rows are
 *      legitimate — two identical marks are two real events. Multisets make
 *      every comparison exact without assuming a key.
 *   3. Re-read immediately before the delete and match tuples to rows then, so
 *      the window between deciding a row number and using it is one round trip
 *      rather than the age of a cached snapshot.
 *   4. Verify after the delete against the pre-delete snapshot, and re-append
 *      anything that went missing. That is the recovery from a mis-targeted
 *      delete, and it works because the snapshot is still in memory.
 *   5. Cap the work per run. A run that cannot finish is not a failure; the
 *      next one continues, because every step is derived from current state.
 *
 * What is NOT recoverable: a crash after the delete and before the verify, in
 * the same moment as an owner sorting the tab. That is roughly a one-round-trip
 * window once a night against rows nobody has touched in months, and the
 * backstop is the Sheet's own version history. Sheets gives no primitive that
 * closes it, so it is documented rather than pretended away.
 */

/** Rows moved in one run, per tab. 5,000 attendance rows is ~490 KB, one
 *  append, and comfortably inside a cron invocation. The remainder waits for
 *  tomorrow rather than risking a timeout mid-delete. */
const ROWS_PER_RUN = 5_000;

export interface MoveReport {
  tab: ArchivableTab;
  copied: number;
  deleted: number;
  /** Rows that were eligible but had vanished from the source before the
   *  delete — an owner edit, or a previous run that got further than it
   *  recorded. Skipped, not an error. */
  vanished: number;
  /** Rows the delete removed that it should not have, and which were put back.
   *  Non-zero means a concurrent edit landed inside the window; the data is
   *  intact but someone should know. */
  repaired: number;
  /** Eligible rows left for the next run because of ROWS_PER_RUN. */
  remaining: number;
}

/** Multiset key for a row. Unit separator: cannot appear in Sheets cell text. */
const keyOf = (row: string[]): string => row.join("\x1f");

const countBy = (rows: string[][]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1);
  return m;
};

/**
 * Move rows matching `select` from `tab` to its archive.
 *
 * Idempotent: re-running after any interruption converges, because the copy
 * step appends only what the destination is missing and the delete step
 * re-derives row numbers from a fresh read.
 */
export async function archiveRows(
  tab: ArchivableTab,
  select: (row: Record<string, string>) => boolean,
  cap: number = ROWS_PER_RUN,
): Promise<MoveReport> {
  const dest = archiveTabName(tab);
  const report: MoveReport = { tab, copied: 0, deleted: 0, vanished: 0, repaired: 0, remaining: 0 };

  // 1. Fresh source snapshot, header included — uncached, because a cached copy
  //    describes a row layout that may already be stale.
  const src = await rawRows(tab);
  if (src.length < 2) return report;
  const [header, ...body] = src;
  const asObj = (row: string[]) =>
    Object.fromEntries(header.map((h, i) => [String(h), String(row[i] ?? "")]));

  const eligible = body.filter((r) => select(asObj(r)));
  if (eligible.length === 0) return report;
  const moving = eligible.slice(0, cap);
  report.remaining = eligible.length - moving.length;

  // 2. Ensure the destination exists and carries the same header. A header
  //    mismatch would make shape() read the archive with the wrong keys.
  await ensureTab(dest, header);

  // 3. Copy what the destination does not already have. This is what makes a
  //    re-run after a crash between copy and delete a no-op rather than a
  //    duplication.
  const destRows = await rawRows(dest);
  const have = countBy(destRows.slice(1));
  const need = countBy(moving);
  const toAppend: string[][] = [];
  for (const [k, n] of need) {
    const missing = n - (have.get(k) ?? 0);
    for (let i = 0; i < missing; i++) toAppend.push(k.split("\x1f"));
  }
  if (toAppend.length) {
    await appendRows(dest, toAppend);
    report.copied = toAppend.length;
  }

  // 4. Confirm every moving row is now in the archive, at the right
  //    multiplicity, BEFORE deleting anything. If this fails nothing has been
  //    removed and the next run simply tries again.
  const after = countBy((await rawRows(dest)).slice(1));
  for (const [k, n] of need) {
    if ((after.get(k) ?? 0) < n) {
      throw new Error(
        `archive copy incomplete for ${tab}: expected ${n} of a row, archive has ${after.get(k) ?? 0}. Nothing deleted.`,
      );
    }
  }

  // 5. Re-read the source and match tuples to row numbers NOW, so the gap
  //    between choosing a row and deleting it is one round trip.
  const src2 = await rawRows(tab);
  const body2 = src2.slice(1);
  const wanted = countBy(moving);
  const rowNumbers: number[] = [];
  body2.forEach((r, i) => {
    const k = keyOf(r);
    const left = wanted.get(k) ?? 0;
    if (left > 0) {
      wanted.set(k, left - 1);
      rowNumbers.push(i + 2); // 1-based, +1 for header
    }
  });
  report.vanished = [...wanted.values()].reduce((a, b) => a + b, 0);
  if (rowNumbers.length === 0) return report;

  await deleteRows(tab, rowNumbers);
  report.deleted = rowNumbers.length;

  // 6. Verify against the pre-delete snapshot and put back anything the delete
  //    took that it should not have. This is the recovery from a sort landing
  //    inside the window — possible because body2 is still in memory.
  const src3 = await rawRows(tab);
  const survived = countBy(src3.slice(1));
  const expected = countBy(body2);
  for (const rn of rowNumbers) {
    const k = keyOf(body2[rn - 2]);
    expected.set(k, (expected.get(k) ?? 1) - 1);
  }
  const lost: string[][] = [];
  for (const [k, n] of expected) {
    const short = n - (survived.get(k) ?? 0);
    for (let i = 0; i < short; i++) lost.push(k.split("\x1f"));
  }
  if (lost.length) {
    await appendRows(tab, lost);
    report.repaired = lost.length;
  }

  invalidateArchiveCache();
  return report;
}
