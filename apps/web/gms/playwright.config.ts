import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the public weather site. Start it first (pnpm dev:web:gms) or
// let Playwright start it; an already running server on :3003 is reused.
// E2E_WEB_SERVER=start serves the production build (`next build` first), which
// is what the "Browser journeys" workflow does; the default stays `pnpm dev`.
const production = process.env.E2E_WEB_SERVER === "start";

export default defineConfig({
  testDir: "./e2e",
  ...(process.env.CI && {
    reporter: [["list"], ["html", { open: "never" }]],
  }),
  // The first request to a cold Next dev server compiles the page (~50 s).
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3003",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    command: production ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3003",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
