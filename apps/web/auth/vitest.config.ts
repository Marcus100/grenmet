import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cold jsdom workers are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Turbo runs two test tasks at once; half the cores each keeps them from starving each other.
    maxWorkers: "50%",
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      // Default scope (files the suite loads), the basis the floors were measured on.
      // Floors only rise; mirrored in scripts/guardrails/coverage-baseline.json.
      thresholds: { lines: 79, branches: 71 },
    },
  },
  resolve: {
    // Shared auth and app imports must resolve the same Next instance for mocks.
    dedupe: ["next"],
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // server-only is a Next.js guard that throws in non-Next environments
      "server-only": path.resolve(
        import.meta.dirname,
        "./src/test/server-only-mock.ts"
      ),
    },
  },
});
