"use client";

import { useActionState, useState } from "react";
import { changePortalPinAction } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * Self-service PIN change for the portal.
 *
 * Collapsed by default: this sits above "Sign out" on a page parents open to
 * check a phone number, and an always-open PIN form there reads as a demand.
 *
 * inputMode="numeric" + pattern keeps the numeric keypad on Android without
 * blocking paste from a password manager, which type="number" would, and
 * autoComplete tells a manager which field is which.
 */
export function ChangePinForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(changePortalPinAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Change PIN
      </button>
    );
  }

  return (
    <form action={action} className="mb-3 rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">Change PIN</p>

      {state.ok ? (
        <p role="status" className="mb-3 rounded-lg bg-success-subtle px-3 py-2 text-sm text-success">
          PIN changed. Use the new one next time you sign in.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-3">
        <Field name="current" label="Current PIN" autoComplete="current-password" />
        <Field name="next" label="New PIN (4-6 digits)" autoComplete="new-password" />
        <Field name="confirm" label="Confirm new PIN" autoComplete="new-password" />
      </div>

      <div className="mt-4 flex gap-2">
        {/* SubmitButton's className REPLACES its default styling rather than
            extending it, so the full class list is repeated here plus flex-1. */}
        <SubmitButton className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
          Save PIN
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={`pin-${name}`} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={`pin-${name}`}
        name={name}
        type="password"
        inputMode="numeric"
        pattern="\d{4,6}"
        maxLength={6}
        required
        autoComplete={autoComplete}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base tracking-widest text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}
