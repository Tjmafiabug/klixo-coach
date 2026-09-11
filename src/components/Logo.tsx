export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M9 16.5 13.5 21 23 11"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center" style={{ gap: size * 0.29 }}>
      <LogoMark size={size} />
      <span
        className="font-bold tracking-tight text-foreground"
        style={{ fontSize: size * 0.66, lineHeight: 1 }}
      >
        KLiXO{" "}
        <span className="font-semibold text-muted-foreground">Coach</span>
      </span>
    </span>
  );
}
