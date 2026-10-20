// riasly — Vitest configuration.
//
// Node environment on purpose: every suite in tests/ targets pure decision logic
// (handle validation, media classification, widget origin rules, the storage
// ceiling). None of it touches the DOM, so pulling jsdom in would only slow the
// suite down and invite component tests that need a browser to be meaningful —
// those belong to the Playwright follow-up, not to `npm test`.
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the single tsconfig path mapping ("@/*" -> "./*"), so a test imports
    // the same specifier the application code uses and cannot pass locally while
    // failing in CI (or the other way round).
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // No dotenv loading: a unit test must not need DATABASE_URL or SMTP to run,
    // which is what keeps `npm test` usable on a fresh clone with no .env.
    clearMocks: true,
  },
});
