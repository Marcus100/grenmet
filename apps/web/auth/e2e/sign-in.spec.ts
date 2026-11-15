import { expect, test } from "@playwright/test";

// Requires: pnpm start (Docker/FastAPI) + pnpm dev:web:auth running.

const RE_WRONG_CREDENTIALS = /incorrect email or password/iu;
const RE_DASHBOARD_PATH = /\/dashboard/u;
const RE_PASSWORD_MODE = /method=password/u;

// The sign-in page leads with an emailed code; these cases use the password form.
const PASSWORD_SIGN_IN = "/?method=password";

test.describe("Sign-in page", () => {
  test("code-first — the emailed code is offered before the password", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Email me a code" })
    ).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByRole("link", { name: "Use password instead" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("happy path — signs in and redirects to /", async ({ page }) => {
    await page.goto(PASSWORD_SIGN_IN);
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // After successful sign-in, the auth app redirects away from /
    await expect(page).not.toHaveURL("/", { timeout: 10_000 });
  });

  test("wrong password — shows error, stays on sign-in", async ({ page }) => {
    await page.goto(PASSWORD_SIGN_IN);
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(RE_WRONG_CREDENTIALS)).toBeVisible();
    await expect(page).toHaveURL(RE_PASSWORD_MODE);
  });

  test("returnTo — redirects to the requested path after sign-in", async ({
    page,
  }) => {
    await page.goto("/?method=password&returnTo=/dashboard&app=wxwatch");
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(RE_DASHBOARD_PATH, { timeout: 10_000 });
  });
});
