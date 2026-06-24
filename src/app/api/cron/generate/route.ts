import { generateSessions } from "@/lib/data";

// Nightly session generation (see vercel.json crons). Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is configured.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await generateSessions();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/generate] failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
