import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Turbo runs two test tasks at once; half the cores each keeps them from starving each other.
    maxWorkers: "50%",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
