import { expect, test } from "@playwright/test";

// Requires: pnpm dev:web:gms running (FastAPI from pnpm start for live data).

const ANY_TITLE = /\S/u;
const PAGES = [
  { name: "home", path: "/" },
  { name: "alerts", path: "/alerts" },
  { name: "about", path: "/about" },
];

for (const { name, path } of PAGES) {
  test(`${name} page renders its landmarks without errors`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(path, { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(ANY_TITLE);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Application error")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}
