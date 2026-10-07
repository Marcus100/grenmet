import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  EVENTS_SSO_CLIENT_SECRET: undefined as string | undefined,
}));
const completeAppSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/auth-config", () => ({ authConfig: { appName: "events" } }));
vi.mock("@barrelsgd/auth/server", () => ({ completeAppSignIn }));

import { GET } from "./route";

const request = new NextRequest(
  "https://events.barrels.gd/auth/callback?code=c&state=s"
);

afterEach(() => {
  vi.resetAllMocks();
  env.EVENTS_SSO_CLIENT_SECRET = undefined;
});

describe("GET /auth/callback", () => {
  it("is off until single sign-on is configured", async () => {
    const response = await GET(request);
    expect(response.status).toBe(404);
    expect(completeAppSignIn).not.toHaveBeenCalled();
  });

  it("redeems with this app's secret and sends failures to sign-in", async () => {
    env.EVENTS_SSO_CLIENT_SECRET = "x".repeat(32);
    completeAppSignIn.mockResolvedValue(
      new NextResponse(null, { status: 307 })
    );
    await GET(request);
    expect(completeAppSignIn).toHaveBeenCalledWith(
      { appName: "events" },
      request,
      { clientSecret: "x".repeat(32), failurePath: "/sign-in" }
    );
  });
});
