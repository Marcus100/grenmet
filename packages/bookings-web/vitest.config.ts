import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cold jsdom workers and typed-in forms are slow under a full parallel run;
    // the 5 s default flakes. The form tests type through user-event, so give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Turbo runs two test tasks at once; half the cores each keeps them from starving each other.
    maxWorkers: "50%",
    environment: "jsdom",
    // Testing Library registers its cleanup through the global afterEach.
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
