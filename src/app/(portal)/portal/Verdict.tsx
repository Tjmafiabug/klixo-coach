"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ENTRANCE, MICRO } from "@/components/motion";

/**
 * The one-sentence answer a student came for (research §2.3). The ring gives
 * the number; this says what the number means, so nobody has to compare it
 * against the threshold themselves.
 */
export function Verdict({ text }: { text: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      className="mt-2 text-xs font-medium text-muted-foreground"
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE}
    >
      {text}
    </motion.p>
  );
}

/**
 * A present-streak. Amber is the system's warmth colour, and this is the one
 * place the portal celebrates rather than reports — so it gets the spark, and
 * a single pop on mount rather than a loop that would nag. Text uses --warning,
 * not --secondary-600: the latter fails AA on the amber tint at this size.
 */
export function StreakSpark({ days, capped = false }: { days: number; capped?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary-subtle px-2 py-0.5 text-[0.7rem] font-semibold text-warning"
      initial={reduce ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...ENTRANCE, delay: 0.15 }}
    >
      <motion.span
        aria-hidden
        initial={reduce ? false : { rotate: -12 }}
        animate={{ rotate: 0 }}
        transition={MICRO}
      >
        ✦
      </motion.span>
      {capped ? `${days}+` : days} in a row
    </motion.span>
  );
}
