"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Wraps the authenticated app segment: a recoverable error within any /today,
// /dashboard, /manage, /timetable, /mark screen renders here with a retry.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: "app" });
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t load this screen. This is often a temporary connection issue
        with the data source.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={() => unstable_retry()}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand px-5 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          Try again
        </button>
        <a
          href="/today"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to Today
        </a>
      </div>
    </main>
  );
}
