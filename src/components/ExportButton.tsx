// Owner CSV export link → /api/export. Server component (just an anchor); the
// download filename comes from the route's Content-Disposition header.
export function ExportButton({
  kind,
  label,
  params,
}: {
  kind: string;
  label: string;
  params?: Record<string, string>;
}) {
  const qs = new URLSearchParams({ kind, ...(params ?? {}) }).toString();
  return (
    <a
      href={`/api/export?${qs}`}
      download
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </a>
  );
}
