import { expect, test } from "@playwright/test";

// Requires the API with the Babydoll seed (scripts/verification/e2e-api.sh
// prepare, then serve) and this app on :3015.
//
// The seeded services take no deposit, so nothing is paid online and the
// booking form has no emailed-code step: that step exists only when a deposit
// is due (apps/api/fastapi/src/bookings/public.py, request_email_code). The
// paid path (deposit, emailed code, Stripe checkout) is not covered here.

const SLUG = "babydoll-beauty-bar";
const BUSINESS = "Babydoll Beauty Bar";
const SERVICE = "Signature brow sculpt & wax";
const CUSTOMER = "Journey Tester";
const PENDING = "Waiting for the studio to confirm";
const RE_MANAGE_URL = new RegExp(`/${SLUG}/booking/[\\w-]+$`, "u");

test("a guest books a seeded service and opens the manage link", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // A new address each run, so a rerun never meets an earlier booking's contact.
  const email = `journey-${Date.now()}@example.com`;

  await page.goto(`/${SLUG}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BUSINESS })
  ).toBeVisible();

  const form = page.getByRole("form", { name: "Book an appointment" });

  // 1. Service. The radio is controlled by React, so `toPass` retries the
  // click until the page has hydrated and the choice sticks.
  const service = form.getByRole("radio", { name: SERVICE });
  // Exact: "2. Pick a day and time" is a group too.
  const times = form.getByRole("group", { exact: true, name: "Time" });
  await expect(async () => {
    await service.check({ timeout: 2000 });
    await expect(times).toBeVisible({ timeout: 5000 });
  }).toPass();

  // 2. The first open time on the first day that has one.
  await times.getByRole("radio").first().check();
  await expect(form.getByText(`${SERVICE}:`)).toBeVisible();

  // 3. Details.
  await form.getByLabel("Name", { exact: true }).fill(CUSTOMER);
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Phone (optional)").fill("+1 473 555 0100");

  // No deposit is due, so the form asks for no emailed code.
  await expect(form.getByLabel("Verification code")).toHaveCount(0);
  await form.getByRole("button", { name: "Request my booking" }).click();

  // Confirmation: the request is in and the manage link is shown.
  const done = page.getByRole("region", { name: "Thank you, Journey" });
  await expect(done).toBeVisible();
  await expect(
    done.getByText("The studio will confirm it by email.")
  ).toBeVisible();
  await expect(done.getByText(SERVICE)).toBeVisible();

  await done.getByRole("link", { name: "Manage my booking" }).click();
  await expect(page).toHaveURL(RE_MANAGE_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your booking" })
  ).toBeVisible();

  // The manage link opened fresh, as from the confirmation email.
  const response = await page.goto(page.url());
  expect(response?.status()).toBe(200);
  const booking = page.getByRole("article");
  await expect(booking.getByRole("heading", { name: SERVICE })).toBeVisible();
  await expect(booking.getByText(PENDING)).toBeVisible();
  await expect(booking.getByText(CUSTOMER)).toBeVisible();

  expect(pageErrors).toEqual([]);
});
