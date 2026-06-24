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
    range: tab,
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
