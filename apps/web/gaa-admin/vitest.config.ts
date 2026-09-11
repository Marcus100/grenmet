import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Share one worker limit across both projects alongside the other Turbo task.
    maxWorkers: 2,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/components/document/use-paper-scale.test.ts"],
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: [
            "src/**/*.test.tsx",
            "src/components/document/use-paper-scale.test.ts",
          ],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
