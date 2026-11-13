import { expect, host, test, watchPageErrors } from "./staging";

const AUTH_HOST = /auth\./u;
const EMAIL = /email/iu;
const PASSWORD = /password/iu;
const SIGN_IN = /sign in/iu;
const PORTAL_HOST = /gms\./u;
const ERROR_BOUNDARY = /something went wrong/iu;

/**
 * Read-only journeys as the staging test account (#933). Skipped, with a
 * reason, until STAGING_E2E_EMAIL and STAGING_E2E_PASSWORD are set.
 */

test.describe.configure({ mode: "serial" });

test("a staff member signs in and reaches the products desk and the register", async ({
  page,
  account,
  stagingDomain,
}) => {
  test.skip(!account, "STAGING_E2E_EMAIL and STAGING_E2E_PASSWORD are not set");
  if (!account) return;
  const errors = watchPageErrors(page);
  await page.goto(host(stagingDomain, "gms"));
  await expect(page).toHaveURL(AUTH_HOST);
  await page.getByLabel(EMAIL).first().fill(account.email);
  await page.getByLabel(PASSWORD).first().fill(account.password);
  await page.getByRole("button", { name: SIGN_IN }).click();
  await expect(page).toHaveURL(PORTAL_HOST, { timeout: 30_000 });

  for (const path of ["/wxproducts", "/wxproducts/hourly"]) {
    const response = await page.goto(host(stagingDomain, "gms", path));
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
