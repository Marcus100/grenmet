import { expect, test } from "@playwright/test";

// The staff desk shares a host with the public, edge-cached alert pages. These
// (The public pages' edge header is checked in src/lib/cache-headers.test.ts:
// `next dev` replaces Cache-Control, so only a production build shows it.)
// These checks stop at the first hop: they never follow sign-in to the auth app.

const TEMPORARY_REDIRECT = 307;

test.describe("staff warning desk on the public host", () => {
  test("a signed-out visit to the desk goes to desk sign-in, never cached", async ({
    request,
  }) => {
    const response = await request.get("/desk/alerts?x=1", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(TEMPORARY_REDIRECT);
    expect(response.headers().location).toBe(
      "/desk/signin?returnTo=%2Fdesk%2Falerts%3Fx%3D1"
    );
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("desk sign-in is private, no-store and not indexed", async ({
    request,
  }) => {
    const response = await request.get("/desk/signin", { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["cache-control"]).not.toContain("s-maxage");
    expect(headers["x-robots-tag"]).toContain("noindex");
  });

  test("the sign-in routes are never cached", async ({ request }) => {
    const response = await request.get("/auth/start?returnTo=%2Fdesk", {
      maxRedirects: 0,
    });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("the desk proxy refuses anything outside its allow-list", async ({
    request,
  }) => {
    const response = await request.get("/desk/api/v1/auth/users/me");
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("a change through the desk proxy from another origin is refused", async ({
    request,
  }) => {
    const response = await request.post("/desk/api/v1/cap/alerts", {
      data: {},
      headers: { origin: "https://events.barrels.gd" },
    });
    expect(response.status()).toBe(403);
  });
});
