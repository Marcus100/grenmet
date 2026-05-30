import { expect, test } from "@playwright/test";

// Requires: pnpm start (Docker/FastAPI) + pnpm dev:web:auth running.

const RE_WRONG_CREDENTIALS = /incorrect email or password/i;
const RE_DASHBOARD_PATH = /\/dashboard/;

test.describe("Sign-in page", () => {
  test("happy path — signs in and redirects to /", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // After successful sign-in, the auth app redirects away from /
    await expect(page).not.toHaveURL("/", { timeout: 10_000 });
  });

  test("wrong password — shows error, stays on sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(RE_WRONG_CREDENTIALS)).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("returnTo — redirects to the requested path after sign-in", async ({
    page,
  }) => {
    await page.goto("/?returnTo=/dashboard&app=wxwatch");
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(RE_DASHBOARD_PATH, { timeout: 10_000 });
  });
});
