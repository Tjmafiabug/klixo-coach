"use client";

import { useActionState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { login, type LoginState } from "@/lib/actions";
import { Wordmark } from "@/components/Logo";
import { fieldClass } from "@/components/ui";
import type { Photo } from "./photo";

const initial: LoginState = {};

export default function LoginForm({ photo }: { photo?: Photo }) {
  const [state, action, pending] = useActionState(login, initial);
  const reduce = useReducedMotion();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/* A classroom photo, heavily washed out: it should read as atmosphere
          behind the card, never as an image competing with the form. Falls
          back to the plain ambient gradient when no key is configured. */}
      {photo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-[position:20%_75%] opacity-[0.55]"
          style={{ backgroundImage: `url(${photo.url})` }}
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: photo
            ? "rgba(255,255,255,0.62)"
            : "radial-gradient(60rem 40rem at 50% -10%, rgba(59,130,246,0.06), transparent 60%)",
        }}
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Wordmark size={46} />
          <p className="text-sm text-muted-foreground">
            Sign in to mark attendance
          </p>
        </div>

        <form
          action={action}
          className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-7"
        >
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-foreground"
          >
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            placeholder="10-digit mobile number"
            className={fieldClass}
            aria-invalid={state.error ? true : undefined}
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
            className={fieldClass}
            aria-invalid={state.error ? true : undefined}
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
            className="mt-6 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-brand font-semibold text-brand-foreground shadow-[var(--shadow-card)] transition-all hover:bg-brand-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Working credentials on the sign-in form — demo deployments only.
            This is a client component, so it needs the NEXT_PUBLIC_ copy; the
            server-side gates use DEMO_MODE. Both default to off. */}
        {process.env.NEXT_PUBLIC_DEMO_MODE === "1" && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Demo — phone <span className="font-semibold text-foreground">9876500001–06</span>,
            PIN <span className="font-semibold text-foreground">1234</span>
          </p>
        )}
      </motion.div>

    </main>
  );
}
