"use client";

import { useEffect, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade-and-rise reveal. Animates once when it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
  id,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Anchor target, so a link elsewhere on the page can scroll to this block. */
  id?: string;
  /** Element to render. Use "li" inside a <ul>: a wrapper <div> between the list
   *  and its items breaks the list semantics, so a screen reader stops
   *  announcing "list, N items" (axe: list / listitem, serious). */
  as?: "div" | "li";
}) {
  const reduce = useReducedMotion();
  const M = as === "li" ? motion.li : motion.div;
  return (
    <M
      id={id}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/**
 * Number that counts up from 0 on mount (respects reduced-motion).
 * Formatting is driven by serializable props only — this is a Client Component,
 * so a `format` function prop cannot cross the RSC boundary.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  locale = false,
  duration = 1.1,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Format the integer with locale grouping (e.g. 2,369). */
  locale?: boolean;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  // Always seed to 0 so SSR and the first client render agree (useReducedMotion
  // is null on the server, so a `reduce`-dependent initial state would mismatch
  // on hydration). The effect then animates — or, for reduced-motion, snaps via
  // a zero-duration tween (no synchronous setState in the effect body).
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: reduce ? 0 : duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  const n = Math.round(display);
  return (
    <>
      {prefix}
      {locale ? n.toLocaleString() : String(n)}
      {suffix}
    </>
  );
}

/* ---- Motion tokens (docs/UX-RESEARCH-2026.md §3.1) ------------------------
   Springs for interactive UI, easing for decorative/sequential. The defaults
   (300ms ease-in-out, 20px slide, no overshoot) are the tell — these are the
   calibrated values. Transform + opacity only; never animate height/top. */

/** Hover, toggle, pill — 150-200ms, bounce under 0.1. */
export const MICRO = { type: "spring", stiffness: 200, damping: 20 } as const;

/** Modal, sheet, toast entrance — slight overshoot. */
export const ENTRANCE = { type: "spring", stiffness: 260, damping: 24 } as const;

/** Exits run faster than entrances. */
export const EXIT = { duration: 0.18, ease: [0.4, 0, 1, 1] } as const;

/** Page / scroll reveal — the decorative curve. */
export const REVEAL = { duration: 0.45, ease: EASE } as const;

/** Slide amplitude. 8-12px, never the 20px default. */
export const SLIDE = 10;

/** Stagger between list items. */
export const STAGGER = 0.04;
