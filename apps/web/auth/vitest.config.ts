import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cold jsdom workers are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Turbo runs two test tasks at once; cap workers so they do not starve each other.
    maxWorkers: 2,
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
