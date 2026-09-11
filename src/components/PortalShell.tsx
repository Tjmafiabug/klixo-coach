"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { Wordmark } from "@/components/Logo";
import { initials } from "@/lib/format";

// Portal is parent/student-facing: phone-first, warm indigo, reassuring. A sticky
// header (identity + sign out) and a thumb-friendly bottom tab bar (≥44px targets).
const TABS: { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement }[] = [
  { href: "/portal", label: "Home", icon: HomeIcon },
  { href: "/portal/attendance", label: "Attendance", icon: CheckIcon },
  { href: "/portal/fees", label: "Fees", icon: RupeeIcon },
  { href: "/portal/progress", label: "Syllabus", icon: BookIcon },
  { href: "/portal/tests", label: "Tests", icon: QuizIcon },
];

const isActive = (pathname: string, href: string) =>
  href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(href + "/");

export function PortalShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[240px_1fr]">
      {/* ---- Desktop rail (replaces the bottom bar above lg) ---- */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-border bg-surface-2 px-3 py-5 lg:flex">
        <Link href="/portal" aria-label="Home" className="mb-4 px-2">
          <Wordmark size={26} />
        </Link>
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-subtle text-brand"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
              {t.label}
            </Link>
          );
        })}
        <div className="mt-auto border-t border-border pt-3">
          <Link
            href="/portal/profile"
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
              {initials(name) || "?"}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="mt-1 flex h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
            >
              <SignOutIcon className="h-[1.15rem] w-[1.15rem] shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col lg:mx-0 lg:max-w-4xl lg:px-8">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md lg:hidden">
        <Link href="/portal" aria-label="Home" className="shrink-0">
          <Wordmark size={24} />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/portal/profile"
            aria-current={isActive(pathname, "/portal/profile") ? "page" : undefined}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-muted"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
              {initials(name) || "?"}
            </span>
            <span className="hidden text-sm font-semibold text-foreground sm:block">{name}</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
              aria-label="Sign out"
            >
              <SignOutIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 lg:px-0 lg:pb-12 lg:pt-8">{children}</main>

      <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/90 backdrop-blur-md lg:hidden">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[0.68rem] font-medium transition-colors ${
                active ? "text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-[1.35rem] w-[1.35rem]" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      </div>
    </div>
  );
}

type IconProps = { className?: string };
const base = (className?: string) => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});
function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
function RupeeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8h5M9.5 11h5M13.5 8c1.5 3-1 4-3.5 4l3.5 4" />
    </svg>
  );
}
function BookIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5V18c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </svg>
  );
}
function QuizIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M9 8.5a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M11 15h.01" />
    </svg>
  );
}
function SignOutIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="M17 8l4 4-4 4M21 12H9" />
    </svg>
  );
}
