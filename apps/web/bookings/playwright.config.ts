import { defineConfig, devices } from "@playwright/test";

// The booking journey for the public booking page. It needs the API with the
// Babydoll seed (scripts/verification/e2e-api.sh). Start the app first
// (pnpm dev:web:bookings) or let Playwright start it; a running server on
// :3015 is reused. E2E_WEB_SERVER=start serves the production build
// (`next build` first), which is what the "Browser journeys" workflow does.
const production = process.env.E2E_WEB_SERVER === "start";

export default defineConfig({
  testDir: "./e2e",
  // The first request to a cold Next dev server compiles the page.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  ...(process.env.CI && {
    reporter: [["list"], ["html", { open: "never" }]],
  }),
  use: {
    baseURL: "http://localhost:3015",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    command: production ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3015/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
