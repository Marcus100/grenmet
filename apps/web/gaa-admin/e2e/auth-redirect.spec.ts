import { expect, test } from "@playwright/test";

// Requires: pnpm dev:web:gaa-admin running. The assertions stop at the first
// redirect hop: following it continues through /auth/start to the auth app,
// which these tests do not depend on.

const TEMPORARY_REDIRECT = 307;

test.describe("unauthenticated visitors", () => {
  test("the home page redirects to sign-in and remembers where they were", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });

    expect(response.status()).toBe(TEMPORARY_REDIRECT);
    expect(response.headers().location).toBe("/signin?returnTo=%2F");
  });

  test("a deep link keeps its path in returnTo", async ({ request }) => {
    const response = await request.get("/hr/forms", { maxRedirects: 0 });

    expect(response.status()).toBe(TEMPORARY_REDIRECT);
    expect(response.headers().location).toBe("/signin?returnTo=%2Fhr%2Fforms");
  });

  test("sign-in hands off to the shared auth start route", async ({
    request,
  }) => {
    const response = await request.get("/signin?returnTo=%2F", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(TEMPORARY_REDIRECT);
    expect(response.headers().location).toBe("/auth/start?returnTo=%2F");
  });
});
