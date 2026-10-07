import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  MBIA_SSO_CLIENT_SECRET: undefined as string | undefined,
}));
const completeAppSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/auth-config", () => ({ authConfig: { appName: "mbia" } }));
vi.mock("@barrelsgd/auth/server", () => ({ completeAppSignIn }));

import { GET } from "./route";

const request = new NextRequest(
  "https://site.test/auth/callback?code=c&state=s"
);

afterEach(() => {
  vi.resetAllMocks();
  env.MBIA_SSO_CLIENT_SECRET = undefined;
});

describe("GET /auth/callback", () => {
  it("is off until single sign-on is configured", async () => {
    expect((await GET(request)).status).toBe(404);
    expect(completeAppSignIn).not.toHaveBeenCalled();
  });

  it("redeems with this site's secret and shows the sign-in notice", async () => {
    env.MBIA_SSO_CLIENT_SECRET = "x".repeat(32);
    completeAppSignIn.mockResolvedValue(
      new NextResponse(null, { status: 307 })
    );
    await GET(request);
    expect(completeAppSignIn).toHaveBeenCalledWith(
      { appName: "mbia" },
      request,
      { clientSecret: "x".repeat(32), notice: true }
    );
  });
});
