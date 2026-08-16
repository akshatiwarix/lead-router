import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // The engine boundary (PLAN.md decision 25). `lib/routing/` is a
  // dependency-free, framework-free package: it may import `zod` and its own
  // relative modules, nothing else. An analyser that cannot reach a network
  // client or a database cannot emit a finding that isn't a consequence of its
  // arguments.
  //
  // Test files are exempt here because `purity.test.ts` reads the engine's
  // source off disk to enforce the same rule with no allowlist at all — that
  // test, not this rule, is the real boundary.
  {
    files: ["lib/routing/**/*.ts"],
    ignores: ["lib/routing/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "next/**",
                "react",
                "react-*",
                "react/**",
                "react-dom/**",
                "@google/genai",
                "@google/**",
                "@/*",
                "@/**",
                "node:*",
                "fs",
                "path",
              ],
              message:
                "lib/routing is dependency-free: only `zod` and relative imports are allowed. Move this code to lib/translate, the data layer, or the route handler.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
