import { brokenImages, expect, host, test, watchPageErrors } from "./staging";

const WEATHER_TITLE = /weather/iu;
const BRAND_LINE = /your spice weather/iu;
const ALERTS_TITLE = /alerts/iu;
const ISSUED_TITLE = /issued forecasts/iu;
const NOT_FOUND = /page not found/iu;
const EMAIL = /email/iu;
const AUTH_HOST = /auth\./u;

const SIGN_IN = /sign in/iu;

test.describe("public weather site", () => {
  test("the homepage shows the current weather with no errors or broken pictures", async ({
    page,
    stagingDomain,
  }) => {
    const errors = watchPageErrors(page);
    const response = await page.goto(host(stagingDomain, "weather"));
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: WEATHER_TITLE })
    ).toBeAttached();
    await expect(page.getByText(BRAND_LINE).first()).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await brokenImages(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("alerts and issued forecasts pages render", async ({
    page,
    stagingDomain,
  }) => {
    const errors = watchPageErrors(page);
    for (const [path, heading] of [
      ["/alerts", ALERTS_TITLE],
      ["/weather/issued", ISSUED_TITLE],
    ] as const) {
      const response = await page.goto(host(stagingDomain, "weather", path));
      expect(response?.status(), path).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("the issued products feed is RSS", async ({
    request,
    stagingDomain,
  }) => {
    const response = await request.get(
      host(stagingDomain, "weather", "/weather/issued/feed.xml")
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/rss+xml");
    expect(await response.text()).toContain('<rss version="2.0"');
  });

  test("an unknown page is a real 404 page", async ({
    page,
    stagingDomain,
  }) => {
    const response = await page.goto(
      host(stagingDomain, "weather", "/journey-missing-page")
    );
    expect(response?.status()).toBe(404);
    await expect(page.getByText(NOT_FOUND).first()).toBeVisible();
  });
});

test.describe("sign-in", () => {
  test("the sign-in page offers email and password", async ({
    page,
    stagingDomain,
  }) => {
    const errors = watchPageErrors(page);
    await page.goto(host(stagingDomain, "auth"));
    await expect(page.getByLabel(EMAIL).first()).toBeVisible();
    await expect(page.getByRole("button", { name: SIGN_IN })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the staff portal sends a signed-out visitor to sign in", async ({
    page,
    stagingDomain,
  }) => {
    await page.goto(host(stagingDomain, "gms"));
    await expect(page).toHaveURL(AUTH_HOST);
    await expect(page.getByRole("button", { name: SIGN_IN })).toBeVisible();
  });
});
