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
 * Every tab in one request, once per request.
 *
 * The core fix for read amplification. A page render touches many tabs — the
 * owner dashboard alone reads 17 — and each separate values.get was a ~2s round
 * trip costing one unit of a 60 reads/min/user quota, so ~3 dashboard loads a
 * minute before throttling. Google counts a batch as a SINGLE request against
 * that quota regardless of how many ranges it carries:
 * https://developers.google.com/workspace/sheets/api/limits
 *
 * Measured on this Sheet: 17 sequential gets 7334ms / 17 units, versus one
 * batchGet of all 24 tabs 2560ms / 1 unit. Whole-Sheet payload is ~345KB,
 * well inside Google's 2MB guidance, so fetching everything and letting callers
 * pick beats tracking which tabs each page needs.
 */
const allTabs = cache(async (): Promise<Map<string, string[][]>> => {
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
}
