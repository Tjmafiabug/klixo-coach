import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./report-error";

/**
 * The error reporter runs inside error handlers, so the one thing it must never
 * do is throw. A reporter that fails while reporting turns one broken page into
 * a broken page plus an unhandled rejection, and hides the original cause.
 *
 * It exists because Vercel keeps runtime logs for one hour on Hobby and one day
 * on Pro, with no alerting — so an error at 9pm was gone by 10pm and nobody was
 * told.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/report-error.ts"), "utf8");

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ERROR_WEBHOOK_URL;
});

describe("reportError never throws", () => {
  it("handles a plain Error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError(new Error("boom"), { scope: "test" })).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("handles a thrown non-Error", () => {
    // `throw "string"` and `throw {code:500}` are both legal and both reach here.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError("just a string", { scope: "test" })).not.toThrow();
    expect(() => reportError({ code: 500 }, { scope: "test" })).not.toThrow();
    expect(() => reportError(null, { scope: "test" })).not.toThrow();
    expect(() => reportError(undefined, { scope: "test" })).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("does not throw when the webhook itself fails", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://example.invalid/hook";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    expect(() => reportError(new Error("boom"), { scope: "test" })).not.toThrow();
    // The delivery is fire-and-forget; give the rejected promise a tick to
    // settle and confirm it was swallowed rather than left unhandled.
    await new Promise((r) => setTimeout(r, 10));
    vi.unstubAllGlobals();
  });

  it("is a no-op on delivery when no webhook is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    reportError(new Error("boom"), { scope: "test" });
    await new Promise((r) => setTimeout(r, 10));
    expect(f, "must not call fetch without ERROR_WEBHOOK_URL").not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("the logged line is searchable", () => {
  it("carries a stable prefix and a JSON payload", () => {
    // Vercel's log search is free text over the message field only, so a
    // consistent prefix is what makes "every portal error this week" findable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("kaboom"), { scope: "portal", studentId: "S001" });
    const [line, payload] = spy.mock.calls[0] as [string, string];
    expect(line).toContain("[klixo-error]");
    expect(line).toContain("portal");
    expect(line).toContain("kaboom");
    const parsed = JSON.parse(payload);
    expect(parsed.scope).toBe("portal");
    expect(parsed.studentId, "context is preserved").toBe("S001");
    expect(parsed.at, "timestamped").toBeTruthy();
  });

  it("includes the digest, which is the only handle a user can read out", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = Object.assign(new Error("server blew up"), { digest: "abc123" });
    reportError(e, { scope: "portal" });
    expect(JSON.parse((spy.mock.calls[0] as [string, string])[1]).digest).toBe("abc123");
  });

  it("truncates the stack rather than shipping all of it", () => {
    // A 1 MB per-request log cap and a 256 KB per-line cap are real; a deep
    // stack from a Server Component can be long.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new Error("deep");
    e.stack = Array.from({ length: 50 }, (_, i) => `    at frame${i}`).join("\n");
    reportError(e, { scope: "test" });
    const stack = JSON.parse((spy.mock.calls[0] as [string, string])[1]).stack as string;
    expect(stack.split("\n").length).toBeLessThanOrEqual(8);
  });
});

describe("every error path reports", () => {
  it("both error boundaries and every API route use the reporter", () => {
    // The portal boundary is the one that did not exist: parents got the bare
    // global-error with no nav, while staff had a friendly screen.
    for (const f of [
      "src/app/(app)/error.tsx",
      "src/app/(portal)/error.tsx",
      "src/app/global-error.tsx",
      "src/app/api/center/route.ts",
      "src/app/api/export/route.ts",
      "src/app/api/cron/generate/route.ts",
      "src/app/api/cron/archive/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} must report errors`).toMatch(/reportError\(/);
    }
  });

  it("the webhook is optional, so the app runs unchanged without it", () => {
    expect(SRC).toMatch(/process\.env\.ERROR_WEBHOOK_URL/);
    expect(SRC, "absent webhook must return early").toMatch(/if \(!url\) return/);
  });

  it("delivery cannot hang a request", () => {
    expect(SRC, "must time the webhook out").toMatch(/AbortSignal\.timeout/);
  });
});
