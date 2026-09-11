"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Wraps the portal segment. Without this, any thrown error escaped to
// global-error.tsx, which replaces the entire root layout — no header, no tab
// bar, no way back except the browser's own controls. The staff app has always
// had a friendly boundary; the parents and students who are the least technical
// audience in the product got the most hostile failure screen.
//
// The copy is deliberately plainer than the staff version: a parent does not
// need to know about "the data source", only whether their money or their
// child's attendance is affected (it is not — this is a read failure) and what
// to do next.
export default function PortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: "portal" });
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        This page didn&apos;t load
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing has changed on your account. Please try again — if it keeps
        happening, tell the centre.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={() => unstable_retry()}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand px-5 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          Try again
        </button>
        <a
          href="/portal"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to Home
        </a>
      </div>
      {error.digest ? (
        // The digest is the only handle on a server error from the client side;
        // it is what makes a parent's "it broke" reportable.
        <p className="mt-6 font-mono text-[0.7rem] text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
