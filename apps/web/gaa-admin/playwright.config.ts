import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the staff admin app. Start it first (pnpm dev:web:gaa-admin) or
// let Playwright start it; an already running server on :3001 is reused.
// E2E_WEB_SERVER=start serves the production build (`next build` first), which
// is what the "Browser journeys" workflow does; the default stays `pnpm dev`.
const production = process.env.E2E_WEB_SERVER === "start";

export default defineConfig({
  testDir: "./e2e",
  ...(process.env.CI && {
    reporter: [["list"], ["html", { open: "never" }]],
  }),
  // The first request to a cold Next dev server compiles the page.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3001",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    command: production ? "pnpm start" : "pnpm dev",
    // Not "/": an unauthenticated visit redirects through the auth app, which
    // Playwright would follow and then wrongly decide the server is down.
    url: "http://localhost:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
