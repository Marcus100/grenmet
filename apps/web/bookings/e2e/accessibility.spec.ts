import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { chooseService, openCategory } from "./service-choice";

// Automated WCAG 2.1 A/AA scan (axe-core) of the two public booking pages at the
// phone reference width (375 px, docs/design/bookings.md). Requires the same API
// with the Babydoll seed as booking.spec.ts (scripts/verification/e2e-api.sh).
// Automation finds only part of WCAG; the keyboard and screen-reader pass stays manual.

const SLUG = "babydoll-beauty-bar";
const BUSINESS = "Babydoll Beauty Bar";
const CATEGORY = "Brows";
const SERVICE = "Signature brow sculpt & wax";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.use({ viewport: { width: 375, height: 812 } });

async function wcagViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}, ${violation.nodes.length} element(s), e.g. ${violation.nodes[0]?.target.join(" ")}`
  );
}

test("the storefront has no WCAG 2.1 A/AA violations axe can find at 375 px", async ({
  page,
}) => {
  await page.goto(`/${SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1, name: BUSINESS })
  ).toBeVisible();
  // Scan the expanded state: a closed category's services are not on the page
  // to a customer, so open the one with the seeded service.
  await openCategory(
    page.getByRole("form", { name: "Book an appointment" }),
    CATEGORY
  );
  await page.waitForLoadState("networkidle");

  expect(await wcagViolations(page)).toEqual([]);
});

test("the manage-booking page has no WCAG 2.1 A/AA violations axe can find at 375 px", async ({
  page,
}) => {
  // A new address each run, so a rerun never meets an earlier booking's contact.
  const email = `axe-${Date.now()}@example.com`;

  await page.goto(`/${SLUG}`, { waitUntil: "domcontentloaded" });
  const form = page.getByRole("form", { name: "Book an appointment" });
  const times = form.getByRole("group", { exact: true, name: "Time" });
  // The radio is controlled by React, so `toPass` retries until hydration sticks.
  // At 375 px the form shows one step at a time: choosing a service moves to
  // the time step at once and hides the service list, so a retry must not look
  // for the radio again once the times are showing.
  await expect(async () => {
    if (!(await times.isVisible())) {
      await chooseService(form, CATEGORY, SERVICE);
    }
    await expect(times).toBeVisible({ timeout: 5000 });
  }).toPass();
  await times.getByRole("radio").first().check();
  // Step 2 to step 3: Continue is available once a time is chosen.
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByLabel("Name", { exact: true }).fill("Axe Scan");
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByRole("button", { name: "Request my booking" }).click();

  const done = page.getByRole("region", { name: "Thank you, Axe" });
  await expect(done).toBeVisible();
  await done.getByRole("link", { name: "Manage my booking" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your booking" })
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(await wcagViolations(page)).toEqual([]);
});
