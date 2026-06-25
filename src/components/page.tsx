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
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
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
