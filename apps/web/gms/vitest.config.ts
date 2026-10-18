import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
      // server-only is a Next.js guard that throws outside Next; tests run outside it.
      {
        find: "server-only",
        replacement: path.resolve(
          import.meta.dirname,
          "./src/test/server-only-mock.ts"
        ),
      },
      // Static image imports: see src/test/image-stub.ts.
      {
        find: /^.*\.(png|jpe?g|gif|svg|webp|avif)$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./src/test/image-stub.ts"
        ),
      },
    ],
  },
  test: {
    // Cold jsdom workers are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "jsdom",
    // Playwright specs live in e2e/ and run through `pnpm e2e`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    maxWorkers: 2,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      // Default scope (files the suite loads), the basis the floors were measured on.
      // Floors only rise; mirrored in scripts/guardrails/coverage-baseline.json.
      thresholds: { lines: 90, branches: 79 },
    },
  },
});
