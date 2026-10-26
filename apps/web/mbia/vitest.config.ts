import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cold jsdom workers are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Turbo runs two test tasks at once; half the cores each keeps them from starving each other.
    maxWorkers: "50%",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      // Floors only rise; mirrored in scripts/guardrails/coverage-baseline.json.
      thresholds: { lines: 23, branches: 38 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // server-only is a Next.js guard that throws outside Next; tests run outside it.
      "server-only": path.resolve(
        import.meta.dirname,
        "./src/test/server-only-mock.ts"
      ),
    },
  },
});
