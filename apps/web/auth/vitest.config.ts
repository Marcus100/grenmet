import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
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
