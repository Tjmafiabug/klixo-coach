import { cache } from "react";
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";

/**
 * Google Sheets is the invisible backend (one Sheet per centre).
 * All access is server-side via a service account. Never expose this client
 * or the Sheet to the browser — the app mediates 100% (PLAN.md §11).
 */

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Identity of the centre this request is serving: which Sheet to read/write and
 * which service account to authenticate as.
 *
 * SINGLE SOURCE OF TRUTH for centre identity. Today it resolves the one centre
 * from env vars. To go multi-tenant later (one app, many centres), change ONLY
 * this function to resolve the centre per-request — every Sheet call already
 * routes through here, so nothing downstream needs to change.
 */
export interface CenterContext {
  sheetId: string;
  serviceAccountJson: string;
}

export function currentCenter(): CenterContext {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error("SHEET_ID is not set");
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  return { sheetId, serviceAccountJson };
}

/** Sheets client cached per service account, so a future multi-tenant request
 *  never reuses another centre's authenticated client. */
const clientCache = new Map<string, ReturnType<typeof sheetsApi>>();

function client() {
  const { serviceAccountJson } = currentCenter();
  const hit = clientCache.get(serviceAccountJson);
  if (hit) return hit;
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new googleAuth.GoogleAuth({ credentials, scopes: SCOPES });
  const c = sheetsApi({ version: "v4", auth });
  clientCache.set(serviceAccountJson, c);
  return c;
}

export function sheetId(): string {
  return currentCenter().sheetId;
}

/** Retry transient Sheets failures (429 rate-limit, 5xx) with exponential
 *  backoff + jitter. Sheets quota is ~60 reads and ~60 writes/min/user, so
 *  bursts of navigation — or a whole batch being marked at once — can spike a
 *  429; this lets them self-heal instead of erroring the screen.
 *
 *  Writes are wrapped too. A 429 is a pre-execution rejection, so retrying it
 *  cannot double-apply; a retried 5xx theoretically could, which is the lesser
 *  risk against a teacher losing a submitted register to a 500. Real
 *  idempotency needs a natural key per row — see the Attendance upsert, which
 *  already keys on (session, student). */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let delay = 350;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const err = e as { code?: number; status?: number; response?: { status?: number } };
      const status = err?.code ?? err?.status ?? err?.response?.status;
      const transient = status === 429 || (typeof status === "number" && status >= 500 && status < 600);
      if (attempt >= tries - 1 || !transient) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 250)));
      delay *= 2;
    }
  }
}

/**
 * The tabs a fully-provisioned centre Sheet has, per scripts/bootstrap-sheet.mjs.
 *
 * Used to spend ONE request on the common path instead of two (metadata, then
 * data). If a Sheet is missing any of these the batch 400s and allTabs falls
 * back to asking for the real tab list — correct either way, just a request
 * slower. sheets.test.ts asserts this stays in step with the bootstrap script.
 */
const KNOWN_TABS = [
  "Config", "Staff", "Students", "Batches", "Enrollments", "Rooms", "Timetable",
  "Sessions", "Attendance", "Holidays", "FeeCharges", "Payments", "Courses",
  "Chapters", "BatchProgress", "PTM", "Tests", "Questions", "Attempts", "Answers",
  "StaffAttendance", "StaffTasks", "SalaryAdjustments", "SalaryPayments",
];

/**
 * Tab titles that actually exist in this centre's Sheet, once per request.
 *
 * Needed because a batchGet naming a missing range fails the WHOLE request with
 * `400 Unable to parse range`. The Phase-2/3 tabs (Tests, Payments, PTM, …) are
 * optional — safeReadTab exists precisely to tolerate their absence — so the
 * batch must ask only for tabs that are really there.
 */
const liveTabs = cache(async (): Promise<Set<string>> => {
  const meta = await withRetry(() =>
    client().spreadsheets.get({
      spreadsheetId: sheetId(),
      fields: "sheets.properties.title", // metadata only — no cell data
    }),
  );
  return new Set(
    (meta.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t)),
  );
});

/**
 * Cross-request cache for the whole-Sheet read.
 *
 * Background: a page render touches many tabs — the owner dashboard alone reads
 * 17 — and each separate values.get was a ~2s round trip costing one unit of a
 * 60 reads/min/user quota. Google counts a batch as a SINGLE request regardless
 * of how many ranges it carries, so `allTabs` fetches everything at once and
 * lets callers pick: measured, 17 sequential gets 7334ms / 17 units versus one
 * batchGet of all 24 tabs 2560ms / 1 unit.
 * https://developers.google.com/workspace/sheets/api/limits
 *
 * React's `cache()` below dedupes within ONE request. That was enough at 9
 * staff; it is not at 40 staff and 200+ parents, because the binding constraint
 * is Google's 60 reads/min/user quota and every page view spends a unit of it.
 * Measured: 40 staff marking (a marking cycle is four separate requests, so
 * four units) plus 500 parents checking the portal, spread over five minutes,
 * ran at 69 reads/min and Google rejected 55% of the staff reads and 45% of the
 * parents'. Teachers could not mark attendance during the busiest period.
 *
 * A few seconds of sharing collapses that: the same burst becomes a handful of
 * batchGets per instance per minute. It also stops most users paying the
 * ~660 ms Sheets round trip at all, which BROWSER-PERF measured as essentially
 * the entire server wait.
 *
 * Deliberately a module-level Map rather than Next's Data Cache: that has a
 * documented ~2 MB per-entry limit, and this payload is 889 KB today and
 * projected past 2 MB at ~150 students — it would silently stop caching exactly
 * when it started to matter. Module state is per-instance, so N instances make
 * N reads per window rather than one; that is still an N-fold reduction and it
 * needs no external store.
 *
 * Keyed by spreadsheet id so a future multi-centre deployment cannot serve one
 * centre's data to another. That key is the whole reason this is safe.
 */
const CACHE_TTL_MS = 5_000;
type Entry = { at: number; rows: Promise<Map<string, string[][]>> };
const sheetCache = new Map<string, Entry>();

/**
 * Drop the cached copy of the current Sheet.
 *
 * Every write helper calls this, so a user always sees their own write on the
 * redirect that follows it — the case the per-request comment on `config()`
 * worries about (a stale `demo_today` dating attendance wrongly) cannot happen,
 * because saving settings invalidates before the next read.
 *
 * What it does NOT cover: an edit the owner makes in the Sheet directly. Those
 * are visible within the TTL rather than instantly. That is the correct
 * trade for a product whose whole point is an editable Sheet — seconds, not
 * minutes — but it is a behaviour change worth knowing about.
 */
export function invalidateSheetCache(): void {
  sheetCache.delete(sheetId());
}

const allTabs = cache(async (): Promise<Map<string, string[][]>> => {
  const key = sheetId();
  const hit = sheetCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const batch = async (tabs: string[]) => {
    const res = await withRetry(() =>
      client().spreadsheets.values.batchGet({
        spreadsheetId: sheetId(),
        ranges: tabs.map((t) => `'${t}'`),
      }),
    );
    const ranges = res.data.valueRanges ?? [];
    // Response order matches request order (documented), so zip by index.
    return new Map(tabs.map((t, i) => [t, ranges[i]?.values ?? []]));
  };

  const fetchAll = async () => {
    // Optimistic path: assume the standard schema and spend ONE request. A Sheet
    // provisioned by bootstrap-sheet.mjs has every tab, so this is the normal case.
    try {
      return await batch(KNOWN_TABS);
    } catch (e) {
      const err = e as { code?: number; response?: { status?: number }; message?: string };
      const missingRange =
        (err?.code === 400 || err?.response?.status === 400) &&
        /Unable to parse range/i.test(err?.message ?? "");
      if (!missingRange) throw e;
      // A tab in KNOWN_TABS isn't provisioned (partial Phase-2/3 rollout), and one
      // bad range fails the whole batch — so pay for metadata and retry with the
      // tabs that really exist. Two requests, still far below one-per-tab.
      return await batch([...(await liveTabs())]);
    }
  };

  // Store the PROMISE, not the resolved value: requests arriving while a fetch
  // is in flight join it instead of starting their own. Under the measured
  // burst that is the difference between one read and dozens.
  const rows = fetchAll();
  sheetCache.set(key, { at: Date.now(), rows });
  // Never cache a failure — a quota rejection would otherwise be replayed to
  // every request for the whole TTL, turning one 429 into seconds of outage.
  rows.catch(() => {
    if (sheetCache.get(key)?.rows === rows) sheetCache.delete(key);
  });
  return rows;
});

/** Rows → objects keyed by the header row. */
function shape<T>(rows: string[][]): T[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[String(h)] = String(r[i] ?? "")));
    return o as T;
  });
}

/**
 * Read a tab. Served from the single per-request batchGet above.
 *
 * Throws the same `400 Unable to parse range` shape as a direct read when the
 * tab doesn't exist, so safeReadTab's existing catch still works unchanged.
 */
export async function readTab<T = Record<string, string>>(tab: string): Promise<T[]> {
  const tabs = await allTabs();
  const rows = tabs.get(tab);
  if (rows === undefined) {
    throw Object.assign(new Error(`Unable to parse range: '${tab}'`), { code: 400 });
  }
  return shape<T>(rows);
}

/**
 * Read a tab, bypassing the per-request dedupe.
 *
 * Use ONLY when re-reading after a write in the same request — after
 * deleteRows, row numbers shift, and the cached copy still describes the old
 * layout, so resequencing against it writes to the wrong rows. Everywhere else
 * use readTab.
 */
export async function readTabUncached<T = Record<string, string>>(
  tab: string,
): Promise<T[]> {
  const res = await withRetry(() =>
    client().spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `'${tab}'`, // quote so tab names with spaces/special chars resolve
    }),
  );
  return shape<T>(res.data.values ?? []);
}

/**
 * The 1-based sheet row holding `id`, read fresh immediately before use.
 *
 * Every positional write in this app computes its row number as `findIndex` + 2
 * over a snapshot, then writes to that index. Appends never move existing rows,
 * but **sorting a tab, inserting above, or deleting above all do** — and the
 * Sheet is deliberately owner-editable, so a human doing exactly that is a
 * supported workflow, not misuse. Between the snapshot and the write, the row
 * at that index may be someone else's.
 *
 * What that costs, by write shape:
 *   - whole-row overwrite → replaces another record with a copy of this one;
 *     the result is internally consistent, so nothing can detect it afterwards
 *   - single-cell update → flips a flag on the wrong record. `Students!H` and
 *     `Staff!D` are PIN writes: one person gets another's PIN
 *   - delete by index → removes a different record outright
 *
 * The per-request snapshot was already ~0.6-2 s old; the cross-request cache
 * widened that to ~7 s. This reads just the id column (a fraction of a full
 * read) right before the index is used, shrinking the window to one round trip.
 *
 * It does NOT make the write atomic. Sheets has no compare-and-swap — verified
 * against the v4 discovery document — so a sort landing inside that round trip
 * still mis-targets. This narrows the window by an order of magnitude; it does
 * not close it. The nightly integrity scan is what catches what slips through.
 *
 * Returns null when the id is absent (deleted meanwhile), so callers can skip
 * rather than write to a guessed row.
 */
export async function rowOf(tab: string, idColumn: string, id: string): Promise<number | null> {
  if (!id) return null;
  const res = await withRetry(() =>
    client().spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `'${tab}'!${idColumn}:${idColumn}`,
    }),
  );
  const col = res.data.values ?? [];
  // col[0] is the header; data starts at sheet row 2.
  for (let i = 1; i < col.length; i++) {
    if (String(col[i]?.[0] ?? "") === id) return i + 1;
  }
  return null;
}

/** Append rows to the bottom of a tab (RAW so HH:mm / dates stay literal text). */
export async function appendRows(tab: string, rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  await withRetry(() =>
    client().spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `'${tab}'`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    }),
  );
  invalidateSheetCache();
}

/** Overwrite a single A1 range with values (RAW). */
export async function updateValues(
  range: string,
  values: string[][],
): Promise<void> {
  await withRetry(() =>
    client().spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    }),
  );
  invalidateSheetCache();
}

/** Overwrite several A1 ranges in one request (RAW). */
export async function batchUpdateValues(
  data: { range: string; values: string[][] }[],
): Promise<void> {
  if (data.length === 0) return;
  await withRetry(() =>
    client().spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { valueInputOption: "RAW", data },
    }),
  );
  invalidateSheetCache();
}

/** Delete rows (1-based sheet row numbers) from a tab. Deletes descending so
 *  earlier deletions don't shift later row indices. */
export async function deleteRows(
  tab: string,
  rowNumbers: number[],
): Promise<void> {
  if (rowNumbers.length === 0) return;
  const meta = await withRetry(() => client().spreadsheets.get({ spreadsheetId: sheetId() }));
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tab);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`tab not found: ${tab}`);
  const requests = [...rowNumbers]
    .sort((a, b) => b - a)
    .map((rn) => ({
      deleteDimension: {
        range: { sheetId: gid, dimension: "ROWS", startIndex: rn - 1, endIndex: rn },
      },
    }));
  await withRetry(() =>
    client().spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { requests },
    }),
  );
  invalidateSheetCache();
}
