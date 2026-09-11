/**
 * One place every error goes.
 *
 * Before this, errors reached `console.error` and stopped there. Vercel keeps
 * runtime logs for **one hour** on Hobby and one day on Pro (30 days only with
 * Observability Plus), and offers no alerting at all — so an error at 9pm was
 * gone by 10pm and nobody was ever told. For a centre where one owner is the
 * whole IT department, "someone will check the dashboard" is not a plan.
 *
 * This does two things:
 *
 *   1. Always logs a single structured line. Structured because the Vercel log
 *      search only does free text over the message, so a consistent prefix and
 *      a JSON payload are what make "show me every portal error this week"
 *      possible at all.
 *   2. Optionally POSTs to a webhook. One env var, no SDK, no vendor lock-in:
 *      point ERROR_WEBHOOK_URL at Slack, Discord, a Google Apps Script, or a
 *      Sentry ingest proxy and it starts alerting. Absent, this is a no-op and
 *      the app behaves exactly as before.
 *
 * Deliberately not an SDK. A tracing SDK is the right answer eventually, but it
 * is a dependency, a bundle cost and an account to provision — and none of that
 * is needed to stop losing errors, which is the actual problem. The seam is
 * here: swapping the body of `deliver` for a real client changes nothing else.
 */

export interface ErrorContext {
  /** Where it happened: "portal", "app", "cron/archive", "api/export". */
  scope: string;
  /** Anything else worth having in the alert. Must be JSON-serialisable. */
  [key: string]: unknown;
}

/** Never let reporting break the thing it is reporting on. */
async function deliver(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Slack and Discord both accept {text}; a generic endpoint gets the
      // structured payload alongside it.
      body: JSON.stringify({ text: summarise(payload), ...payload }),
      // An alert is not worth holding a response open for.
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // A failed alert must never surface as a second error. The console line
    // below has already happened, so nothing is lost that was not already lost.
  }
}

function summarise(p: Record<string, unknown>): string {
  const scope = String(p.scope ?? "unknown");
  const msg = String(p.message ?? "unknown error");
  const digest = p.digest ? ` (digest ${String(p.digest)})` : "";
  return `KLiXO Coach — ${scope}: ${msg}${digest}`;
}

/**
 * Report an error. Safe to call from a Client Component (the webhook is
 * server-only, so a browser call logs and returns).
 */
export function reportError(error: unknown, context: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload: Record<string, unknown> = {
    ...context,
    message: err.message,
    // A digest is the only handle the client has on a server error, and the
    // only thing a parent can read out over the phone.
    digest: (err as Error & { digest?: string }).digest,
    stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    at: new Date().toISOString(),
  };

  // One line, one prefix, JSON body — greppable in the Vercel log search, which
  // only does free text over the message field.
  console.error(`[klixo-error] ${summarise(payload)}`, JSON.stringify(payload));

  // Fire and forget. On the server this reaches the webhook; in the browser
  // ERROR_WEBHOOK_URL is undefined, so it returns immediately.
  void deliver(payload);
}
