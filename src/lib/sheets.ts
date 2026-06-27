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
 *  backoff + jitter. Sheets read quota is ~60/min/user, so bursts of navigation
 *  can spike a 429 — this lets them self-heal instead of erroring the screen. */
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

/** Read a tab and return rows as objects keyed by the header row. */
export async function readTab<T = Record<string, string>>(
  tab: string,
): Promise<T[]> {
  const res = await withRetry(() =>
    client().spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `'${tab}'`, // quote so tab names with spaces/special chars resolve
    }),
  );
  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[String(h)] = String(r[i] ?? "")));
    return o as T;
  });
}

/** Append rows to the bottom of a tab (RAW so HH:mm / dates stay literal text). */
export async function appendRows(tab: string, rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  await client().spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `'${tab}'`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/** Overwrite a single A1 range with values (RAW). */
export async function updateValues(
  range: string,
  values: string[][],
): Promise<void> {
  await client().spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/** Overwrite several A1 ranges in one request (RAW). */
export async function batchUpdateValues(
  data: { range: string; values: string[][] }[],
): Promise<void> {
  if (data.length === 0) return;
  await client().spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: { valueInputOption: "RAW", data },
  });
}

/** Delete rows (1-based sheet row numbers) from a tab. Deletes descending so
 *  earlier deletions don't shift later row indices. */
export async function deleteRows(
  tab: string,
  rowNumbers: number[],
): Promise<void> {
  if (rowNumbers.length === 0) return;
  const meta = await client().spreadsheets.get({ spreadsheetId: sheetId() });
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
  await client().spreadsheets.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: { requests },
  });
}
