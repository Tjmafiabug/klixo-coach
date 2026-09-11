import Link from "next/link";
import { Reveal } from "@/components/motion";

/** One thing the owner should do, and where to go to do it.
 *  `tone` drives the accent; `count` is the size of the pile. */
export interface NeedItem {
  tone: "danger" | "warning" | "info";
  count: number;
  /** What is wrong — the signal. */
  label: string;
  /** What to do about it — the verb. */
  action: string;
  href: string;
}

const TONE = {
  danger: { text: "text-danger", bg: "bg-danger-subtle", ring: "border-danger/25", dot: "bg-danger-solid" },
  warning: { text: "text-warning", bg: "bg-warning-subtle", ring: "border-warning/25", dot: "bg-warning-solid" },
  info: { text: "text-info", bg: "bg-info-subtle", ring: "border-info/25", dot: "bg-info-solid" },
} as const;

/**
 * The action queue: a cockpit, not a report (research §2.2). Every other band
 * on this page answers "how is the centre doing"; this one answers "what do I
 * do now", by pairing each signal with the screen that resolves it. Items are
 * ordered most-urgent first and the whole band disappears when nothing is
 * pending — an empty queue should feel like clearance, not a blank card.
 */
export function NeedsYou({ items }: { items: NeedItem[] }) {
  const live = items.filter((i) => i.count > 0);
  if (live.length === 0) return null;

  return (
    <Reveal delay={0.02}>
      <section aria-labelledby="needs-you" className="mt-5">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 id="needs-you" className="text-sm font-semibold tracking-tight text-foreground">
            Needs you
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {live.length} item{live.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* 4-up on wide screens: the queue is usually 2-5 items, and a 3-col
            grid strands the 4th alone on its own row. */}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {live.map((i) => {
            const t = TONE[i.tone];
            return (
              <li key={i.href + i.label}>
                <Link
                  href={i.href}
                  className={`group flex h-full items-center gap-3 rounded-2xl border ${t.ring} ${t.bg} px-4 py-3 transition-all hover:shadow-[var(--shadow-card)] active:scale-[0.99]`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-mono text-lg font-bold tabular-nums leading-none ${t.text}`}>
                      {i.count}
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium text-foreground">
                      {i.label}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${t.text}`}>
                    {i.action}
                    <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </Reveal>
  );
}
