import { expect, type Page, test } from "@playwright/test";
import { chooseService } from "./service-choice";

// The whole customer path on one booking page: open the business, choose a
// service and a time, enter details, book, see the confirmation, open the
// manage link, cancel, and see the booking cancelled. Once at phone width, where
// the form shows Service, Time and Details one step at a time, and once at
// laptop width, where it is one page.
//
// Data: the same API with the Babydoll seed as booking.spec.ts
// (scripts/verification/e2e-api.sh prepare, then serve; the "Browser journeys"
// workflow does this). The seeded services take no deposit, so there is no
// emailed-code step.
//
// Each run books under a new email address and cancels what it booked, so the
// per-customer limit on open bookings (and the seed's free times) are never
// used up. The booking is made on the last day of the first window of dates the
// picker offers: the studio refuses cancelling inside 24 hours of the start
// (`cancel_cutoff_hours`), and the earliest times are about a day away.

const SLUG = "babydoll-beauty-bar";
const BUSINESS = "Babydoll Beauty Bar";
const CATEGORY = "Brows";
const SERVICE = "Signature brow sculpt & wax";
const RE_MANAGE_URL = new RegExp(`/${SLUG}/booking/[\\w-]+$`, "u");
const REASON = "Journey test: plans changed";
const CANCELLED_NOTICE =
  "Your booking is cancelled. We have emailed you a confirmation and told the business.";

async function bookManageAndCancel(
  page: Page,
  { phone, tag }: { phone: boolean; tag: string }
): Promise<void> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const email = `e2e+${tag}-${Date.now()}@example.com`;
  const first = `Cancel${tag}`;
  const customer = `${first} Tester`;

  await page.goto(`/${SLUG}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BUSINESS })
  ).toBeVisible();
  const form = page.getByRole("form", { name: "Book an appointment" });
  // Exact: "2. Pick a day and time" is a group too.
  const times = form.getByRole("group", { exact: true, name: "Time" });

  // 1. Service. The radio is controlled by React, so `toPass` retries until the
  // page has hydrated and the choice sticks. On a phone, choosing a service
  // does not move on: Continue does, so the retry presses it once the list is
  // showing.
  await expect(async () => {
    if (!(await times.isVisible())) {
      await chooseService(form, CATEGORY, SERVICE);
      if (phone) {
        await form.getByRole("button", { name: "Continue" }).click();
      }
    }
    await expect(times).toBeVisible({ timeout: 5000 });
  }).toPass();

  // 2. The last day offered, then its first time. Choosing a day clears the
  // time, so the day comes first.
  const days = form.getByRole("group", { exact: true, name: "Day" });
  await days.getByRole("radio").last().check();
  await times.getByRole("radio").first().check();
  if (phone) {
    await form.getByRole("button", { name: "Continue" }).click();
  }

  // 3. Details.
  await form.getByLabel("Name", { exact: true }).fill(customer);
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Phone (optional)").fill("+1 473 555 0100");
  await expect(form.getByLabel("Verification code")).toHaveCount(0);
  await form.getByRole("button", { name: "Request my booking" }).click();

  // Confirmation.
  const done = page.getByRole("region", { name: `Thank you, ${first}` });
  await expect(done).toBeVisible();
  await expect(done.getByText(SERVICE)).toBeVisible();
  await done.getByRole("link", { name: "Manage my booking" }).click();
  await expect(page).toHaveURL(RE_MANAGE_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your booking" })
  ).toBeVisible();

  // Manage page: the booking is open and can be cancelled.
  const booking = page.getByRole("article");
  await expect(booking.getByRole("heading", { name: SERVICE })).toBeVisible();
  await expect(booking.getByText(customer)).toBeVisible();
  await expect(
    booking.getByText("Waiting for the studio to confirm")
  ).toBeVisible();

  // Cancel: ask, give a reason, confirm. The button is controlled by React, so
  // `toPass` retries the click until the page has hydrated.
  const confirm = booking.getByRole("group", { name: "Confirm cancellation" });
  await expect(async () => {
    await booking.getByRole("button", { name: "Cancel booking" }).click();
    await expect(confirm).toBeVisible({ timeout: 2000 });
  }).toPass();
  await confirm.getByLabel("Reason for cancelling (optional)").fill(REASON);
  await confirm.getByRole("button", { name: "Yes, cancel my booking" }).click();

  // Cancelled: the status line, the status word, and no more actions.
  await expect(
    page.getByRole("status").filter({ hasText: "cancelled" })
  ).toHaveText(CANCELLED_NOTICE);
  await expect(booking.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(
    booking.getByRole("button", { name: "Cancel booking" })
  ).toHaveCount(0);
  await expect(
    booking.getByRole("button", { name: "Change time" })
  ).toHaveCount(0);

  // The cancellation was saved: the link opened fresh still says so.
  const response = await page.goto(page.url());
  expect(response?.status()).toBe(200);
  const reopened = page.getByRole("article");
  await expect(reopened.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: "Cancel booking" })
  ).toHaveCount(0);

  expect(pageErrors).toEqual([]);
}

test.describe("on a phone (375 px, touch)", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test("a guest books in three steps, opens the manage link and cancels", async ({
    page,
  }) => {
    await bookManageAndCancel(page, { phone: true, tag: "phone" });
  });
});

test.describe("on a laptop (Desktop Chrome)", () => {
  test("a guest books on one page, opens the manage link and cancels", async ({
    page,
  }) => {
    await bookManageAndCancel(page, { phone: false, tag: "laptop" });
  });
});
