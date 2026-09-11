"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";

/** Back link with a chevron — consistent across all sub-pages. */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M10 3.5 5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}

/**
 * Premium page header: optional back link, title, subtitle, and right-aligned
 * actions — reveal-animated for parity with the dashboard.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel = "Back",
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <Reveal>
      <div>
        {backHref ? (
          <div className="mb-3">
            <BackLink href={backHref}>{backLabel}</BackLink>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p className="label-mono mt-1.5 text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
    </Reveal>
  );
}

/** Primary call-to-action link, styled as the graphite brand button. */
export function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground shadow-[var(--shadow-card)] transition-all hover:bg-brand-hover active:scale-[0.98]"
    >
      {children}
    </Link>
  );
}

/** Secondary (outline) action link — the muted sibling of PrimaryLink. */
export function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}

/** Prev / label / next stepper for a period (day or month). Takes ready-built
 *  hrefs — strings only, so it's safe to render from a Server Component (a
 *  function prop would break RSC serialization on client navigation). */
export function MonthNav({
  label,
  prevHref,
  nextHref,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
}) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="flex items-center gap-2">
      <Link href={prevHref} className={btn} aria-label="Previous">
        ←
      </Link>
      <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums text-foreground">
        {label}
      </span>
      <Link href={nextHref} className={btn} aria-label="Next">
        →
      </Link>
    </div>
  );
}

/** Native GET search box → navigates to `${action}?q=…` with no client JS.
 *  Submitting drops other params (e.g. page), so a new search resets to page 1. */
export function SearchBox({
  action,
  placeholder,
  defaultValue,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
}) {
  return (
    <form action={action} method="get" className="w-full sm:w-64" role="search">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </form>
  );
}

/** Server-rendered prev/next pager. `params` (e.g. q, period) are preserved in
 *  the page links. Renders nothing when there's only one page. */
export function Pager({
  page,
  pages,
  total,
  start,
  size,
  baseHref,
  params = {},
}: {
  page: number;
  pages: number;
  total: number;
  start: number;
  size: number;
  baseHref: string;
  params?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const link = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set("page", String(p));
    return `${baseHref}?${qs.toString()}`;
  };
  const cls =
    "rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.98]";
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={link(page - 1)} className={`${cls} text-foreground hover:bg-muted`}>
          ‹ Prev
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cls} cursor-not-allowed text-muted-foreground`}>‹ Prev</span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        {start + 1}–{Math.min(start + size, total)} of {total}
      </span>
      {page < pages ? (
        <Link href={link(page + 1)} className={`${cls} text-foreground hover:bg-muted`}>
          Next ›
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cls} cursor-not-allowed text-muted-foreground`}>Next ›</span>
      )}
    </nav>
  );
}

/** Chevron affordance for clickable list rows. */
export function RowChevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
    >
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Horizontal filter tabs for a list page.
 *
 * A bar, not a faceted panel: these pages filter on a handful of attributes the
 * owner already knows they want, which is what a bar is for. The active filter
 * lives in the URL so a view survives navigation and can be bookmarked — the
 * most-cited frustration with SaaS list views is a filter that silently resets
 * when you click into a record and come back.
 */
export function FilterTabs({
  filters,
  active,
  baseHref,
  params = {},
}: {
  /** `key: undefined` is the "all" tab. `count` is shown when known. */
  filters: { key?: string; label: string; count?: number }[];
  active?: string;
  baseHref: string;
  /** Other query params to preserve (search, etc). `page` is deliberately
   *  dropped: changing the filter changes the result set, so page 3 of the old
   *  one is meaningless. */
  params?: Record<string, string | undefined>;
}) {
  const href = (key?: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (key) qs.set("filter", key);
    const q = qs.toString();
    return q ? `${baseHref}?${q}` : baseHref;
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const on = f.key === active || (!active && f.key === undefined);
        return (
          <Link
            key={f.label}
            href={href(f.key)}
            aria-current={on ? "page" : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              on
                ? "border-brand bg-brand-subtle text-brand"
                : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
            {f.count !== undefined ? (
              <span className={`font-mono tabular-nums ${on ? "text-brand" : "text-muted-foreground"}`}>
                {f.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
