import { fullIntegrityScan, generateSessions } from "@/lib/data";

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

    // Scan after generating, so the report reflects what the run just wrote.
    // This is the only place the full scan runs unattended: integrityIssues is
    // otherwise reached only when an owner opens the dashboard, so corruption
    // on a Sheet nobody looked at was never recorded. Reports only — the owner
    // repairs their own Sheet, which is the point of the product.
    //
    // Deliberately not fatal: a scan failure must not make the cron look like
    // session generation failed, because that is the part someone would act on.
    let integrity: { count: number; issues: string[] } | { error: string };
    try {
      const issues = await fullIntegrityScan();
      integrity = { count: issues.length, issues: issues.slice(0, 20).map((i) => `${i.kind}: ${i.detail}`) };
      if (issues.length) {
        console.warn(`[cron/generate] ${issues.length} integrity issue(s):`);
        for (const i of issues.slice(0, 20)) console.warn(`  ${i.kind}: ${i.detail}`);
        if (issues.length > 20) console.warn(`  …and ${issues.length - 20} more`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      console.error("[cron/generate] integrity scan failed:", e);
      integrity = { error: message };
    }

    return Response.json({ ok: true, ...result, integrity });
  } catch (err) {
    console.error("[cron/generate] failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
