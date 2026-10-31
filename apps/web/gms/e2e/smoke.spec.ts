import { expect, test } from "@playwright/test";

// Requires: pnpm dev:web:gms running (FastAPI from pnpm start for live data).

const ANY_TITLE = /\S/;
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

test("a missing page is rendered on the server with status 404", async ({
  request,
}) => {
  // Fetch the HTML without running any script: the not-found page must be in
  // the document itself, not an empty error shell filled in by JavaScript.
  const response = await request.get("/this-page-does-not-exist");
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).not.toContain('id="__next_error__"');
  expect(html).toContain("Page not found");
});
