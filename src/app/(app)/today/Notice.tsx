"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ENTRANCE, SLIDE } from "@/components/motion";

/** The landing half of the mark-saved arc: the teacher submits on /mark, and
 *  this is what greets them back on /today. Springs in so the confirmation
 *  reads as the result of their action rather than as page furniture. */
export function Notice({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      role="status"
      className="mt-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success-subtle px-3 py-2.5 text-sm font-medium text-success"
      initial={reduce ? false : { opacity: 0, y: -SLIDE, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={ENTRANCE}
    >
      {children}
    </motion.p>
  );
}
