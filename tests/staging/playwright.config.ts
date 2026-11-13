import { defineConfig, devices } from "@playwright/test";
import type { StagingOptions } from "./staging";

/** The staging basic-auth gate, from STAGING_BASIC_AUTH ("user:password"). */
function basicAuth(): { username: string; password: string } | undefined {
  const value = process.env.STAGING_BASIC_AUTH;
  const index = value?.indexOf(":") ?? -1;
  if (!value || index < 0) return undefined;
  return { username: value.slice(0, index), password: value.slice(index + 1) };
}

function account(): StagingOptions["account"] {
  const email = process.env.STAGING_E2E_EMAIL;
  const password = process.env.STAGING_E2E_PASSWORD;
  return email && password ? { email, password } : undefined;
}

/**
 * Journeys against the deployed staging stack (owner decision, 11 Nov 2026):
 * run after each staging deploy by .github/workflows/staging-smoke.yml, or by
 * hand with `pnpm e2e:staging` (needs STAGING_BASIC_AUTH). Read-only: no
 * journey issues, sends or deletes anything.
 */
export default defineConfig<StagingOptions>({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // One retry in CI only, for a cold staging container; a second failure is real.
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    account: account(),
    stagingDomain: process.env.STAGING_DOMAIN ?? "staging.barrels.gd",
    httpCredentials: basicAuth(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      // Layout on a phone matters for the public site only.
      testMatch: /public\.spec\.ts/u,
    },
  ],
});
