"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { logout } from "@/lib/actions";
import { Wordmark } from "@/components/Logo";

type Role = "owner" | "teacher";

interface NavItem {
  href: string;
  label: string;
  desc: string;
  icon: (p: { className?: string }) => React.ReactElement;
  match: string[];
  ownerOnly: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Every main feature is one click from the sidebar — Workspace = daily ops,
// Manage = the centre's data & config (the old /manage hub's cards, promoted).
const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/today", label: "Today", desc: "Mark attendance for the day", icon: TodayIcon, match: ["/today", "/mark", "/new-session"], ownerOnly: false },
      { href: "/dashboard", label: "Dashboard", desc: "Attendance health across the centre", icon: DashIcon, match: ["/dashboard"], ownerOnly: true },
      { href: "/timetable", label: "Timetable", desc: "Recurring schedule & clashes", icon: ClockIcon, match: ["/timetable"], ownerOnly: true },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/manage/students", label: "Students", desc: "Roster & enrollments", icon: UsersIcon, match: ["/manage/students"], ownerOnly: true },
      { href: "/manage/batches", label: "Batches", desc: "Classes, fees & curriculum progress", icon: BatchesIcon, match: ["/manage/batches"], ownerOnly: true },
      { href: "/manage/fees", label: "Fees", desc: "Dues, payments & defaulters", icon: FeesIcon, match: ["/manage/fees"], ownerOnly: true },
      { href: "/manage/curriculum", label: "Curriculum", desc: "Syllabus & chapters by class", icon: CurriculumIcon, match: ["/manage/curriculum"], ownerOnly: true },
      { href: "/manage/teachers", label: "Teachers", desc: "Staff & PINs", icon: TeachersIcon, match: ["/manage/teachers"], ownerOnly: true },
      { href: "/manage/rooms", label: "Rooms", desc: "Rooms & capacity", icon: RoomsIcon, match: ["/manage/rooms"], ownerOnly: true },
      { href: "/manage/holidays", label: "Holidays", desc: "Non-teaching days", icon: HolidaysIcon, match: ["/manage/holidays"], ownerOnly: true },
      { href: "/manage/settings", label: "Settings", desc: "Centre name, threshold & term", icon: SettingsIcon, match: ["/manage/settings"], ownerOnly: true },
    ],
  },
];

const isMatch = (pathname: string, item: NavItem) =>
  item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));

export function AppShell({
  name,
  role,
  children,
}: {
  name: string;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // sections with role-visible items only (drops a section that empties out,
  // e.g. teachers see just Workspace > Today)
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => role === "owner" || !i.ownerOnly),
  })).filter((s) => s.items.length > 0);
  const flat = sections.flatMap((s) => s.items);
  // header title/subtitle: matched item, the /manage overview, or the first item
  const active =
    flat.find((i) => isMatch(pathname, i)) ??
    (pathname === "/manage" || pathname.startsWith("/manage/")
      ? { label: "Manage", desc: "Centre data & configuration" }
      : flat[0]);

  // Accessible modal behaviour for the mobile drawer: lock body scroll, trap
  // focus, close on Escape, and return focus to the trigger on close.
  useEffect(() => {
    if (!drawer) return;
    const el = drawerRef.current;
    const trigger = triggerRef.current;
    const focusables = () =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    focusables()[0]?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        return;
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [drawer]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* ---- Desktop sidebar ---- */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface-2 px-4 py-5 lg:flex">
        <SidebarBody
          sections={sections}
          pathname={pathname}
          name={name}
          role={role}
          reduce={!!reduce}
        />
      </aside>

      {/* ---- Mobile drawer ---- */}
      <AnimatePresence>
        {drawer ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
              aria-hidden
            />
            <motion.aside
              ref={drawerRef}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[82%] flex-col border-r border-border bg-surface-2 px-4 py-5 lg:hidden"
              initial={{ x: reduce ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <SidebarBody
                sections={sections}
                pathname={pathname}
                name={name}
                role={role}
                reduce={!!reduce}
                onNavigate={() => setDrawer(false)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* ---- Content column ---- */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              ref={triggerRef}
              onClick={() => setDrawer(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground transition-colors hover:bg-muted active:scale-95 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawer}
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[0.95rem] font-semibold tracking-tight text-foreground">
                {active.label}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {active.desc}
              </p>
            </div>

            {/* Identity lives in the sidebar footer; on mobile the sidebar is a
                drawer, so keep a compact avatar here for at-a-glance identity. */}
            <div className="lg:hidden">
              <InitialsAvatar name={name} />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarBody({
  sections,
  pathname,
  name,
  role,
  reduce,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  name: string;
  role: Role;
  reduce: boolean;
  onNavigate?: () => void;
}) {
  let idx = 0; // running index → stagger animation flows across both groups
  return (
    <>
      <Link
        href="/today"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5"
        aria-label="KLiXO Coach home"
      >
        <Wordmark size={26} />
      </Link>

      <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scroll-slim">
        {sections.map((section, si) => (
          <div key={section.title} className={si > 0 ? "mt-4" : undefined}>
            <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
            {section.items.map((item) => {
              const active = isMatch(pathname, item);
              const Icon = item.icon;
              const i = idx++;
              return (
                <motion.div
                  key={item.href}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduce ? 0 : 0.03 * i + 0.04, duration: 0.25 }}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] ${
                      active
                        ? "text-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {active ? (
                      <motion.span
                        layoutId={reduce ? undefined : "nav-active"}
                        className="absolute inset-0 -z-10 rounded-xl bg-brand-subtle"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    <Icon
                      className={`h-[1.15rem] w-[1.15rem] shrink-0 ${
                        active ? "text-brand" : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                    {item.label}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <InitialsAvatar name={name} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-foreground">
              {name}
            </p>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              {role}
            </p>
          </div>
        </div>
        <form action={logout} className="mt-1">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger active:scale-[0.98]"
          >
            <SignOutIcon className="h-[1.15rem] w-[1.15rem]" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

function InitialsAvatar({ name }: { name: string }) {
  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
      {initials}
    </span>
  );
}

/* ---- Icons: clean 1.75-stroke SVG primitives ---- */
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

function TodayIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
function DashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.6" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="6" rx="1.6" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.6" />
    </svg>
  );
}
function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}
function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}
function BatchesIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
    </svg>
  );
}
function CurriculumIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5V18c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </svg>
  );
}
function TeachersIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6 20a6 6 0 0 1 12 0" />
      <path d="m9 8 1.8 1.8L14 6.5" />
    </svg>
  );
}
function RoomsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20V6.5L13 4v16M13 9l6 2v9M3 20h18" />
      <path d="M9 12v2" />
    </svg>
  );
}
function HolidaysIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="m10 14 4 3M14 14l-4 3" />
    </svg>
  );
}
function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 7h10M4 17h6" />
      <circle cx="17" cy="7" r="2.4" />
      <circle cx="13" cy="17" r="2.4" />
    </svg>
  );
}
function FeesIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M12 8v8M9 11h6M9 13h4" />
    </svg>
  );
}
function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
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
