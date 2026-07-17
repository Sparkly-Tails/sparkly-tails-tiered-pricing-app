import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Every internal link must carry the auth token (see src/proxy.ts) or it
  // silently 403s. AuthLink.tsx is the only place allowed to import next/link.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/AuthLink.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Use AuthLink (src/components/AuthLink.tsx) instead — a bare next/link silently drops the auth token.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
