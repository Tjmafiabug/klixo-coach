// Shown during navigation/streaming within the authenticated app segment.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-5 flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
    </main>
  );
}
