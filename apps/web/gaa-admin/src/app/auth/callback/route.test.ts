import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  GAA_ADMIN_SSO_CLIENT_SECRET: undefined as string | undefined,
}));
const completeAppSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/auth-config", () => ({
  getAuthConfig: () => ({ appName: "gaa-admin" }),
}));
vi.mock("@barrelsgd/auth/server", () => ({ completeAppSignIn }));

import { GET } from "./route";

const request = new NextRequest(
  "https://admin.test/auth/callback?code=c&state=s"
);

afterEach(() => {
  vi.resetAllMocks();
  env.GAA_ADMIN_SSO_CLIENT_SECRET = undefined;
});

describe("GET /auth/callback", () => {
  it("says so plainly when single sign-on isn't configured", async () => {
    expect((await GET(request)).status).toBe(503);
    expect(completeAppSignIn).not.toHaveBeenCalled();
  });

  it("redeems with the admin secret and sends failures to /signin", async () => {
    env.GAA_ADMIN_SSO_CLIENT_SECRET = "x".repeat(32);
    completeAppSignIn.mockResolvedValue(
      new NextResponse(null, { status: 307 })
    );
    await GET(request);
    expect(completeAppSignIn).toHaveBeenCalledWith(
      { appName: "gaa-admin" },
      request,
      { clientSecret: "x".repeat(32), failurePath: "/signin" }
    );
  });
});
