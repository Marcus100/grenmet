import { brokenImages, expect, host, test, watchPageErrors } from "./staging";

// Read-only journeys for Barrels Events and Barrels Bookings: the public pages
// render with no page errors, and a missing page is a clear "not found" that
// search engines are told not to index. Paid orders and deposits need sign-in
// and test payments, so they are not covered here.

const EVENTS_HOME = /find your people/iu;
const WHATS_ON = /what.s on/iu;
const BOOKINGS_HOME = /online appointments/iu;
const NOT_FOUND = /not found/iu;
const NOINDEX = /noindex/iu;

test.describe("Barrels Events", () => {
  test("the home and listing pages render with no errors or broken pictures", async ({
    page,
    stagingDomain,
  }) => {
    const errors = watchPageErrors(page);
    for (const [path, heading] of [
      ["/", EVENTS_HOME],
      ["/events", WHATS_ON],
    ] as const) {
      const response = await page.goto(host(stagingDomain, "events", path));
      expect(response?.status(), path).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
    }
    await page.waitForLoadState("networkidle");
    expect(await brokenImages(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a missing event says so and is not indexed", async ({
    page,
    stagingDomain,
  }) => {
    // The status is 200, not 404, while the page streams behind loading.tsx;
    // what the visitor and a search engine see is checked instead.
    await page.goto(
      host(stagingDomain, "events", "/events/staging-journey-no-such-event")
    );
    await expect(page.getByText(NOT_FOUND).first()).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      NOINDEX
    );
  });
});

test.describe("Barrels Bookings", () => {
  test("the home page renders with no errors", async ({
    page,
    stagingDomain,
  }) => {
    const errors = watchPageErrors(page);
    const response = await page.goto(host(stagingDomain, "bookings"));
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: BOOKINGS_HOME })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a booking page that does not exist is a real 404", async ({
    page,
    stagingDomain,
  }) => {
    const response = await page.goto(
      host(stagingDomain, "bookings", "/staging-journey-no-such-studio")
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND })
    ).toBeVisible();
  });
});
