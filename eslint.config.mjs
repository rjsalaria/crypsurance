import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output — minified bundles and compiled workers are not source, and
    // linting them buried the real findings under ~90 spurious errors.
    "crypsurance-site/**",
    "faucet-worker/dist/**",
    "protocol/target/**",
  ]),
  {
    // These pages are mostly prose, and `&apos;` soup makes the copy harder to
    // read and edit than the apostrophes it replaces. JSX escapes text nodes
    // correctly on its own; the rule is a stylistic preference, not a defect.
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Operational scripts run under Node and Anchor's mocha, which are
    // CommonJS. `require` is correct there, not a mistake to be flagged.
    files: [
      "solana/**/*.js",
      "protocol/scripts/**/*.js",
      "protocol/tests/**/*.ts",
      "faucet-worker/**/*.js",
      "scripts/**/*.mjs",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Anchor's generated program type is structural and enormous; the tests
    // reach past it to assert on error codes. `any` there is deliberate.
    files: ["protocol/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
