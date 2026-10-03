import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

const mockCookies = {
  delete: vi.fn(),
  get: vi.fn(() => ({ value: "binding" })),
  set: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mockCookies),
}));
vi.mock("@/lib/env", () => ({
  env: { AUTH_APP_URL: "https://auth.staging.barrels.gd" },
}));
vi.mock("@/lib/modern-auth", () => ({
  googleComplete: vi
    .fn()
    .mockResolvedValue({ challenge: "challenge", requires_totp: false }),
  modernCookieOptions: {},
}));

import { googleComplete } from "@/lib/modern-auth";
import { GET } from "./route";

afterEach(() => vi.clearAllMocks());

it("redirects Google completion to the public auth host", async () => {
  const request = new NextRequest(
    "http://0.0.0.0:3000/google/callback?code=code&state=state"
  );
  const response = await GET(request);
  expect(response.headers.get("location")).toBe(
    "https://auth.staging.barrels.gd/google/confirm?mfa=0"
  );
  expect(googleComplete).toHaveBeenCalledOnce();
});
