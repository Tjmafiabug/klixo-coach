import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getManageCountsWithFees } from "@/lib/data";
import { rupees } from "@/lib/format";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

type IconProps = { className?: string };
const svg = (className?: string) => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

function UsersIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}
function BatchesIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
    </svg>
  );
}
function CurriculumIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5V18c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </svg>
  );
}
function TeachersIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6 20a6 6 0 0 1 12 0" />
      <path d="m9 8 1.8 1.8L14 6.5" />
    </svg>
  );
}
function ClockIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}
function RoomsIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <path d="M4 20V6.5L13 4v16M13 9l6 2v9M3 20h18" />
      <path d="M9 12v2" />
    </svg>
  );
}
function HolidaysIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="m10 14 4 3M14 14l-4 3" />
    </svg>
  );
}
function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <path d="M4 7h10M4 17h6" />
      <circle cx="17" cy="7" r="2.4" />
      <circle cx="13" cy="17" r="2.4" />
    </svg>
  );
}
function FeesIcon({ className }: IconProps) {
  return (
    <svg {...svg(className)}>
      <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M12 8v8M9 11h6M9 13h4" />
    </svg>
  );
}

export default async function ManagePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const c = await getManageCountsWithFees();

  const cards = [
    { href: "/manage/students", title: "Students", sub: `${c.studentsActive} active · ${c.studentsTotal} total`, icon: UsersIcon },
    { href: "/manage/batches", title: "Batches", sub: `${c.batchesActive} active · ${c.batchesTotal} total`, icon: BatchesIcon },
    { href: "/manage/fees", title: "Fees", sub: `${rupees(c.feesOutstanding)} outstanding`, icon: FeesIcon },
    { href: "/manage/curriculum", title: "Curriculum", sub: "Syllabus & chapters by class", icon: CurriculumIcon },
    { href: "/manage/staff", title: "Staff", sub: `${c.teachersActive} active staff`, icon: TeachersIcon },
    { href: "/timetable", title: "Timetable", sub: `${c.rules} recurring rules`, icon: ClockIcon },
    { href: "/manage/rooms", title: "Rooms", sub: `${c.rooms} rooms`, icon: RoomsIcon },
    { href: "/manage/holidays", title: "Holidays", sub: `${c.holidays} dates`, icon: HolidaysIcon },
    { href: "/manage/settings", title: "Settings", sub: "Name · threshold · branding", icon: SettingsIcon },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Reveal>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Manage centre
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the centre without touching the spreadsheet.
        </p>
      </Reveal>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Reveal key={card.href} delay={Math.min(i * 0.05, 0.3)} className="h-full">
              <Link
                href={card.href}
                className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                  <Icon className="h-[1.3rem] w-[1.3rem]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">
                    {card.title}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground tabular-nums">
                    {card.sub}
                  </span>
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                >
                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
