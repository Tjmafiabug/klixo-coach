import { getSession } from "@/lib/auth";
import {
  toCsv,
  reportAttendance,
  reportDefaulters,
  reportBatches,
  reportStudent,
  reportFees,
  effectiveToday,
} from "@/lib/data";

// CSV exports for the owner. Node runtime (googleapis); always live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | null) => (v && ISO.test(v) ? v : undefined);

export async function GET(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "owner") {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";

  try {
    let rows: string[][] | null;
    let name: string;
    switch (kind) {
      case "attendance":
        rows = await reportAttendance({
          from: clean(url.searchParams.get("from")),
          to: clean(url.searchParams.get("to")),
          batchId: url.searchParams.get("batch") || undefined,
        });
        name = "attendance";
        break;
      case "defaulters":
        rows = await reportDefaulters();
        name = "defaulters";
        break;
      case "batches":
        rows = await reportBatches();
        name = "batch-summary";
        break;
      case "student": {
        const id = url.searchParams.get("id") ?? "";
        rows = await reportStudent(id);
        name = `student-${id}`;
        break;
      }
      case "fees":
        rows = await reportFees();
        name = "fees";
        break;
      default:
        return new Response("Unknown export kind", { status: 400 });
    }

    if (!rows) return new Response("Not found", { status: 404 });

    const filename = `klixo-${name}-${await effectiveToday()}.csv`;
    // Prepend a UTF-8 BOM so Excel opens non-ASCII names correctly.
    return new Response("﻿" + toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error(`[/api/export] kind=${kind} failed:`, err);
    return new Response("Export failed", { status: 500 });
  }
}
