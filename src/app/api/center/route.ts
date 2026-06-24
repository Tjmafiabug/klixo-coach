import { readTab } from "@/lib/sheets";
import { getSession } from "@/lib/auth";

// Reads the Config tab to prove the Sheets pipeline end-to-end.
// Node runtime (googleapis needs Node, not Edge); dynamic (live read).
// Gated behind a session so it isn't an anonymous data endpoint (N3 hardening).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const config = await readTab<{ key: string; value: string }>("Config");
    const map = Object.fromEntries(config.map((r) => [r.key, r.value]));
    return Response.json({
      ok: true,
      center_name: map.center_name ?? null,
      timezone: map.timezone ?? null,
      attendance_threshold: map.attendance_threshold ?? null,
    });
  } catch (err) {
    console.error("[/api/center] failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
