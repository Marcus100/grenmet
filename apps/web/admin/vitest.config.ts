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
    // jsdom looks like a browser to the typed env module, which then refuses
    // server variables; supply the values the code under test reads instead.
    env: {
      SKIP_ENV_VALIDATION: "true",
      AUTH_APP_URL: "http://localhost:3000",
      AUTH_API_URL: "http://localhost:8000",
      AUTH_API_V1_STR: "/api/v1",
      BARRELS_ADMIN_SESSION_COOKIE_NAME: "barrels_admin_session",
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Next's marker package throws outside a server bundle; tests are not one.
      "server-only": path.resolve(import.meta.dirname, "./src/test/empty.ts"),
    },
  },
});
