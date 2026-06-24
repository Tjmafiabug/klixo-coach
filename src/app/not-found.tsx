import Link from "next/link";

// Global 404 (rendered by notFound() and unmatched routes).
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/today"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
      >
        Back to Today
      </Link>
    </main>
  );
}
