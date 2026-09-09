import { defineConfig } from "vitest/config";

// Node environment only. Everything under test here is server-side logic —
// pure date/lockout/authz helpers and the guard-conformance scan. Component
// tests would need jsdom; async Server Components can't render under Vitest at
// all (Next's own docs say so), so those belong in Playwright instead.
export default defineConfig({
  resolve: {
    // Vite resolves tsconfig "@/*" paths natively — no plugin needed.
    tsconfigPaths: true,
    alias: {
      // "server-only" is a build-time marker Next uses to fail the build if a
      // server module is imported from a client one. It has no Node runtime, so
      // stub it out — the guarantee is enforced at build, not under test.
      "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
