"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ENTRANCE, EXIT, SLIDE } from "@/components/motion";

export interface Command {
  href: string;
  label: string;
  desc: string;
  /** Section it belongs to — shown as the row's trailing hint. */
  group: string;
}

/** Subsequence match: "mst" finds "Manage students". Cheap, no dependency, and
 *  forgiving of the typos a fuzzy matcher is usually reached for. */
function score(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return 500 - direct;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return 100;
  }
  return -1;
}

/**
 * Cmd+K navigation over every route the user can reach (research §2.2).
 * With 14 manage screens the navigation cost is the real tax on an owner, and
 * a palette erases it without adding another visible nav surface.
 */
export function CommandPalette({
  commands,
  open,
  setOpen,
}: {
  commands: Command[];
  open: boolean;
  setOpen: (fn: boolean | ((v: boolean) => boolean)) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands
      .map((c) => ({ c, s: Math.max(score(needle, c.label), score(needle, c.desc) - 200) }))
      .filter((r) => r.s > -1)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c);
  }, [commands, q]);

  // Cmd+K / Ctrl+K toggles from anywhere. Opening clears the previous query —
  // a stale search would hide everything behind a filter the user didn't type.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape belongs on the document, not the dialog: after a click the
      // focus may sit outside the dialog subtree, and a react onKeyDown there
      // never fires — the palette would be stuck open.
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setSel(0);
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Keep the active row in view when arrowing past the visible window.
  useEffect(() => {
    listRef.current?.querySelectorAll("li")[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[sel];
      if (hit) {
        setOpen(false);
        router.push(hit.href);
      }
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 px-4 pt-[12vh] backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={EXIT}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]"
            initial={reduce ? false : { opacity: 0, y: -SLIDE, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={ENTRANCE}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              placeholder="Jump to…"
              aria-label="Search screens"
              aria-controls="cmdk-list"
              className="h-14 w-full border-b border-border bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground"
            />
            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing matches “{q}”.
              </p>
            ) : (
              <ul id="cmdk-list" ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5 scroll-slim">
                {results.map((c, i) => (
                  <li key={c.href}>
                    <button
                      type="button"
                      onMouseEnter={() => setSel(i)}
                      onClick={() => {
                        setOpen(false);
                        router.push(c.href);
                      }}
                      aria-current={i === sel ? "true" : undefined}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        i === sel ? "bg-brand-subtle" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${i === sel ? "text-brand" : "text-foreground"}`}>
                          {c.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.desc}</span>
                      </span>
                      <span className="label-mono shrink-0 text-muted-foreground">{c.group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
