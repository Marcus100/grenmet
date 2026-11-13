import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the public alert hub and the staff warning desk. Start it
// first (pnpm dev:web:cap) or let Playwright start it; a running server on
// :3010 is reused.
export default defineConfig({
  testDir: "./e2e",
  // The first request to a cold Next dev server compiles the page.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3010" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3010/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
