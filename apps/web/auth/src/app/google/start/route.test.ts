import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ delete: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));
vi.mock("@/lib/env", () => ({
  env: { AUTH_ALLOWED_RETURN_HOSTS: ".barrels.gd" },
}));
vi.mock("@/lib/modern-auth", () => ({
  googleStart: vi
    .fn()
    .mockResolvedValue({ authorization_url: "https://accounts.google.test/" }),
  modernCookieOptions: {},
}));

import { GET } from "./route";

afterEach(() => vi.clearAllMocks());

it("remembers a safe return address across the Google round trip", async () => {
  await GET(
    new NextRequest(
      "https://auth.barrels.gd/google/start?returnTo=%2Fcontinue%3Fapp%3Devents"
    )
  );
  expect(jar.set).toHaveBeenCalledWith(
    "google_return",
    "/continue?app=events",
    {}
  );
});

it("drops an off-site return address", async () => {
  await GET(
    new NextRequest(
      "https://auth.barrels.gd/google/start?returnTo=https%3A%2F%2Fevil.test%2F"
    )
  );
  expect(jar.set).not.toHaveBeenCalledWith(
    "google_return",
    expect.anything(),
    expect.anything()
  );
  expect(jar.delete).toHaveBeenCalledWith("google_return");
});
