import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("./auth-config", () => ({ getAuthConfig: () => ({}) }));

import { AuthApiError } from "@barrelsgd/auth";
import { continuePath, parseHandoffRequest, startHandoff } from "./handoff";

const STATE = "s".repeat(32);
const request = { app: "events", state: STATE };

afterEach(() => vi.resetAllMocks());

describe("parseHandoffRequest", () => {
  it("accepts only a registry-shaped key and a long random state", () => {
    expect(parseHandoffRequest("events", STATE)).toEqual(request);
    expect(parseHandoffRequest("Events", STATE)).toBeNull();
    expect(parseHandoffRequest("events", "short")).toBeNull();
    expect(parseHandoffRequest("events/../x", STATE)).toBeNull();
    expect(parseHandoffRequest(null, STATE)).toBeNull();
    expect(continuePath(request)).toBe(`/continue?app=events&state=${STATE}`);
  });
});

describe("startHandoff", () => {
  it("redirects to the registered callback with the code and state", async () => {
    authApiFetch.mockResolvedValueOnce({
      code: "one-use",
      callback_url: "https://events.barrels.gd/auth/callback",
    });
    const result = await startHandoff(request, "account-session");
    expect(result).toEqual({
      kind: "redirect",
      url: `https://events.barrels.gd/auth/callback?code=one-use&state=${STATE}`,
    });
    expect(authApiFetch.mock.calls[0]?.[3]).toEqual({
      body: { session_token: "account-session", state: STATE, join: false },
      method: "POST",
    });
  });

  it.each([
    [401, { kind: "sign-in" }],
    [404, { kind: "unavailable" }],
    [409, { kind: "join", label: "Barrels Events" }],
    [403, { kind: "denied", label: "Barrels Events", detail: "No access" }],
  ])("maps a %s to the right screen", async (status, expected) => {
    authApiFetch
      .mockRejectedValueOnce(new AuthApiError(status, "No access"))
      .mockResolvedValueOnce({ label: "Barrels Events" });
    expect(await startHandoff(request, "account-session")).toEqual(expected);
  });

  it("lets outages surface", async () => {
    authApiFetch.mockRejectedValueOnce(new AuthApiError(503, "down"));
    await expect(startHandoff(request, "account-session")).rejects.toThrow();
  });
});
