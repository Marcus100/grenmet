import { expect, type Page, test } from "@playwright/test";

// Requires: pnpm start (Docker/FastAPI) + pnpm dev:web:auth running.
// The account is the first superuser the API seeds in a local environment
// (scripts/initial_data.py: FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD), with
// the placeholder values local development and CI both use.
const EMAIL = "admin@example.com";
const PASSWORD = "changethis";

const RE_WRONG_CREDENTIALS = /incorrect email or password/iu;
const RE_PASSWORD_MODE = /method=password/u;

// The sign-in page leads with an emailed code; these cases use the password form.
const PASSWORD_SIGN_IN = "/?method=password";

// By role: the "Show password" button carries the word "password" as well.
const password = (page: Page) =>
  page.getByRole("textbox", { name: "Password" });

test.describe("Sign-in page", () => {
  test("code-first — the emailed code is offered before the password", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Email me a code" })
    ).toBeVisible();
    await expect(password(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Use password instead" }).click();
    await expect(password(page)).toBeVisible();
  });

  test("happy path — signs in and lands on the profile", async ({ page }) => {
    await page.goto(PASSWORD_SIGN_IN);
    await page.getByLabel("Email address").fill(EMAIL);
    await password(page).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // A session now exists: "/" shows the account instead of the sign-in form.
    await expect(
      page.getByRole("heading", { level: 1, name: "Profile" })
    ).toBeVisible();
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.getByText("Administrator")).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("wrong password — shows error, stays on sign-in", async ({ page }) => {
    await page.goto(PASSWORD_SIGN_IN);
    await page.getByLabel("Email address").fill(EMAIL);
    await password(page).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(RE_WRONG_CREDENTIALS)).toBeVisible();
    await expect(page).toHaveURL(RE_PASSWORD_MODE);
  });

  test("returnTo — redirects to the requested path after sign-in", async ({
    page,
  }) => {
    await page.goto("/?method=password&returnTo=/security");
    await page.getByLabel("Email address").fill(EMAIL);
    await password(page).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // The exact address: the sign-in address carries "/security" as a
    // parameter too, so a pattern match would pass without any redirect.
    await expect(page).toHaveURL("/security");
    await expect(
      page.getByRole("heading", { level: 1, name: "Security" })
    ).toBeVisible();
  });
});
