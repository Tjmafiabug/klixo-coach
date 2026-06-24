import { google } from "googleapis";

/**
 * Google Sheets is the invisible backend (one Sheet per centre).
 * All access is server-side via a service account. Never expose this client
 * or the Sheet to the browser — the app mediates 100% (PLAN.md §11).
 */

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let cached: ReturnType<typeof google.sheets> | null = null;

function client() {
  if (cached) return cached;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

export function sheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID is not set");
  return id;
}

/** Read a tab and return rows as objects keyed by the header row. */
export async function readTab<T = Record<string, string>>(
  tab: string,
): Promise<T[]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `'${tab}'`, // quote so tab names with spaces/special chars resolve
  });
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
