import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the staff admin app. Start it first (pnpm dev:web:gaa-admin) or
// let Playwright start it; an already running server on :3001 is reused.
export default defineConfig({
  testDir: "./e2e",
  // The first request to a cold Next dev server compiles the page.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3001",
  },
  webServer: {
    command: "pnpm dev",
    // Not "/": an unauthenticated visit redirects through the auth app, which
    // Playwright would follow and then wrongly decide the server is down.
    url: "http://localhost:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
