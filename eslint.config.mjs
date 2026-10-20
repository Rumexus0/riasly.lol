// riasly — ESLint flat config (ESLint 9).
//
// Why this file exists: `npm run lint` used to call `next lint`, which shipped
// without an eslint installed and without any config, so the command could never
// have run — and `next lint` is removed in Next 16. The repo therefore drives
// eslint directly (see the `lint` script in package.json) and keeps the Next
// presets through FlatCompat, which is how eslint-config-next 15 still publishes
// them (eslintrc-style files, no flat entry point yet).
//
// Everything ignored below is either generated (build caches, Prisma client),
// third-party (node_modules), user data (storage/), or static media (public/) —
// linting those would report problems nobody can fix in a source editor.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next*/**",
      ".cache/**",
      "coverage/**",
      "public/**",
      "storage/**",
      "prisma/generated/**",
      "next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // The codebase deliberately marks best-effort failures with an empty catch
      // (`await prisma.x.catch(() => {})`) in ~60 places: a helper that threw would
      // take a profile page down with it. That is a documented convention, so the
      // rule that fights it is noise rather than signal.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // `_`-prefixed args are the repo's spelling for "intentionally unused",
      // which is how a server action keeps a positional signature readable.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // `any` is banned in new code, but the streaming responses and the framer
      // motion variants both need a cast at the edge of a third-party type; those
      // carry their own comment. Keep it a warning so the ban is visible without
      // turning an existing codebase red on day one.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;
