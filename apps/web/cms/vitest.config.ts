import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // Cold jsdom workers are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Turbo runs two test tasks at once; cap workers so they do not starve each other.
    maxWorkers: 2,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
