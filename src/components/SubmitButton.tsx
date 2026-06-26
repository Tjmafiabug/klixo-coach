"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself and shows a pending label while its form
 * is in flight. Reused across the management forms (server actions).
 */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  className,
  disabled,
  ariaLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  /** Extra disable condition (OR'd with pending) — e.g. an edge/no-op control. */
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={
        className ??
        "inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? pendingText : children}
    </button>
  );
}
