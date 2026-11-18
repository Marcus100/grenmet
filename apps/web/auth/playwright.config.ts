import { defineConfig, devices } from "@playwright/test";

// E2E_WEB_SERVER=start serves the production build (`next build` first), which
// is what the "Browser journeys" workflow does; the default stays `pnpm dev`.
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
    baseURL: "http://localhost:3000",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    command: production ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
