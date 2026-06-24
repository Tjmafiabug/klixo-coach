"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        action={action}
        className="w-full max-w-sm rounded-2xl border border-black/10 p-6 shadow-sm dark:border-white/15"
      >
        <h1 className="text-2xl font-bold tracking-tight">
          KLiXO <span className="text-indigo-600">Coach</span>
        </h1>
        <p className="mt-1 text-sm text-black/55 dark:text-white/55">
          Sign in with your phone &amp; PIN.
        </p>

        <label className="mt-6 block text-sm font-medium">Phone</label>
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          placeholder="9876500001"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20"
        />

        <label className="mt-4 block text-sm font-medium">PIN</label>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="••••"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-white/20"
        />

        {state.error ? (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-black/40 dark:text-white/40">
          Demo: any teacher phone (9876500001–06), PIN 1234
        </p>
      </form>
    </main>
  );
}
