import Link from "next/link";

/** A progress ring (SVG, server-renderable). `tone` picks the stroke colour. */
export function Ring({
  pct,
  label,
  sub,
  tone = "brand",
  size = 132,
}: {
  pct: number; // 0..100
  label: string;
  sub?: string;
  tone?: "brand" | "success" | "warning" | "danger";
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = {
    brand: "var(--brand)",
    success: "var(--success-solid)",
    warning: "var(--warning-solid)",
    danger: "var(--danger-solid)",
  }[tone];
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{label}</p>
        {sub ? <p className="text-xs font-medium text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

/** A card. When `href` is set the whole card is a tap target. */
export function Tile({
  href,
  children,
  className = "",
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = `rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] ${className}`;
  return href ? (
    <Link href={href} className={`${cls} block transition-colors hover:bg-muted/40 active:scale-[0.99]`}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Page heading for a portal screen. */
export function PortalTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
