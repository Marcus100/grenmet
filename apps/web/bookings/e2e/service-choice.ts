import type { Locator } from "@playwright/test";

// The storefront groups services by category. Only the first category opens by
// default, so a customer opens the one holding the service they want. A flat
// list (one category, or none) has no disclosure, and nothing is clicked.

/** The disclosure of a category on the booking form, if the page shows one. */
function categorySection(form: Locator, category: string): Locator {
  return form.locator("details.service-category", {
    has: form.locator("summary h3", {
      hasText: new RegExp(`^${category}$`, "u"),
    }),
  });
}

/** Opens a category's disclosure when it is closed. Safe to repeat. */
export async function openCategory(
  form: Locator,
  category: string
): Promise<void> {
  const section = categorySection(form, category).first();
  if ((await section.count()) === 0) {
    return;
  }
  if ((await section.getAttribute("open")) === null) {
    await section.locator("summary").click();
  }
}

/**
 * Chooses a service the way a customer does: opens its category, then checks
 * its radio. Call it inside `toPass`, since the radio is controlled by React
 * and the click retries until the page has hydrated and the choice sticks.
 */
export async function chooseService(
  form: Locator,
  category: string,
  service: string
): Promise<void> {
  await openCategory(form, category);
  await form.getByRole("radio", { name: service }).check({ timeout: 2000 });
}
