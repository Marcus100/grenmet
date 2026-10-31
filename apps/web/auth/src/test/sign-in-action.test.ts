import { beforeEach, describe, expect, it, vi } from "vitest";

const RE_UNABLE_TO_REACH = /unable to reach/i;
const RE_REQUIRED = /required/i;
const RE_NOT_ACCEPTED = /not accepted/i;

// vi.hoisted ensures these are available when vi.mock factories are hoisted.
const { mockRedirect, mockCookiesSet, mockCookiesGet } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockCookiesSet: vi.fn(),
  mockCookiesGet: vi
    .fn<() => { value: string } | undefined>()
    .mockReturnValue(undefined),
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookiesSet,
    get: mockCookiesGet,
  }),
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { signInAction, signOutAction } from "@/app/actions";
import {
  signInAwaitingApproval,
  signInBadCredentials,
  signInMalformedResponse,
  signInMfaRequired,
  signInServiceDown,
  signInSuccess,
  signOutSuccess,
} from "./handlers";
import { server } from "./msw-server";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("signInAction", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockCookiesSet.mockClear();
  });

  it("writes the session cookie and redirects on valid credentials", async () => {
    server.use(signInSuccess);
    await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(mockCookiesSet).toHaveBeenCalledOnce();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to returnTo when provided", async () => {
    server.use(signInSuccess);
    await signInAction(
      { email: "", error: null, next: null },
      makeFormData({
        email: "jane@example.com",
        password: "secret",
        returnTo: "/dashboard",
      })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("uses the local fallback for an external-looking path", async () => {
    server.use(signInSuccess);
    await signInAction(
      { email: "", error: null, next: null },
      makeFormData({
        email: "jane@example.com",
        password: "secret",
        returnTo: "/\\evil.example.com/steal",
      })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("returns error for bad credentials", async () => {
    server.use(signInBadCredentials);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "wrong" })
    );
    expect(result.error).toBe("Incorrect email or password");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("asks for the authenticator code without an error on the first attempt", async () => {
    server.use(signInMfaRequired);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(result).toEqual({
      email: "jane@example.com",
      error: null,
      next: "mfa",
    });
  });

  it("reports a rejected authenticator code and stays on the code step", async () => {
    server.use(signInMfaRequired);
    const result = await signInAction(
      { email: "", error: null, next: "mfa" },
      makeFormData({
        email: "jane@example.com",
        password: "secret",
        totp_code: "000000",
      })
    );
    expect(result.next).toBe("mfa");
    expect(result.error).toMatch(RE_NOT_ACCEPTED);
  });

  it("does not offer verification for accounts awaiting approval", async () => {
    server.use(signInAwaitingApproval);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(result.next).toBeNull();
    expect(result.error).toBe(
      "Your registration is awaiting administrator approval"
    );
  });

  it("reports a malformed 200 response as an unavailable auth service", async () => {
    server.use(signInMalformedResponse);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(result.error).toMatch(RE_UNABLE_TO_REACH);
  });

  it("returns error when auth service is unreachable", async () => {
    server.use(signInServiceDown);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(result.error).toMatch(RE_UNABLE_TO_REACH);
  });

  it("returns validation error when fields are empty", async () => {
    const result = await signInAction(
      { email: "", error: null, next: null },
      new FormData()
    );
    expect(result.error).toMatch(RE_REQUIRED);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("signOutAction", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockCookiesSet.mockClear();
  });

  it("clears the cookie and redirects", async () => {
    server.use(signOutSuccess);
    mockCookiesGet.mockReturnValueOnce({ value: "tok_test" });
    await signOutAction(new FormData());
    expect(mockCookiesSet).toHaveBeenCalledOnce();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
