"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import "./globals.css";

// Catches errors thrown in the root layout/template. Must render its own
// <html>/<body> (it replaces the root layout when active).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="mt-5 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
