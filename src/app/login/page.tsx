"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions";
import { LogoMark } from "@/components/Logo";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark size={44} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              KLiXO Coach
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to mark attendance
            </p>
          </div>
        </div>

        <form
          action={action}
          className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <label htmlFor="phone" className="block text-sm font-medium text-foreground">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            placeholder="9876500001"
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          <label
            htmlFor="pin"
            className="mt-4 block text-sm font-medium text-foreground"
          >
            PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="••••"
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          {state.error ? (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo — phone <span className="font-semibold">9876500001–06</span>, PIN{" "}
          <span className="font-semibold">1234</span>
        </p>
      </div>
    </main>
  );
}
