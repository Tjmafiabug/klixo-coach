import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local scratch projects — untracked, not part of the app, and not built or
    // deployed. Linting them only produces failures CI can never see, since
    // these directories don't exist in a fresh checkout.
    "video/**",
    "edmingle/**",
    "designs/**",
  ]),
]);

export default eslintConfig;
