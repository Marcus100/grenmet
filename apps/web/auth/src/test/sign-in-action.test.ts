import { beforeEach, describe, expect, it, vi } from "vitest";

const RE_UNABLE_TO_REACH = /unable to reach/i;
const RE_REQUIRED = /required/i;
const RE_DO_NOT_MATCH = /do not match/i;
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

import { signInAction, signOutAction, signUpAction } from "@/app/actions";
import {
  signInAwaitingApproval,
  signInBadCredentials,
  signInMalformedResponse,
  signInMfaRequired,
  signInServiceDown,
  signInSuccess,
  signInVerifyRequired,
  signOutSuccess,
  signUpEmailTaken,
  signUpSuccess,
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

  it("points unverified accounts at email verification", async () => {
    server.use(signInVerifyRequired);
    const result = await signInAction(
      { email: "", error: null, next: null },
      makeFormData({ email: "jane@example.com", password: "secret" })
    );
    expect(result.next).toBe("verify");
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

describe("signUpAction", () => {
  const validFields = {
    email: "new@example.com",
    username: "newuser",
    password: "password1",
    confirm_password: "password1",
    first_name: "New",
    last_name: "User",
  };

  it("returns success state when signup succeeds", async () => {
    server.use(signUpSuccess);
    const result = await signUpAction(
      { email: "", error: null, success: false },
      makeFormData(validFields)
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns error when passwords do not match", async () => {
    const result = await signUpAction(
      { email: "", error: null, success: false },
      makeFormData({ ...validFields, confirm_password: "different" })
    );
    expect(result.error).toMatch(RE_DO_NOT_MATCH);
  });

  it("returns error when email is already registered", async () => {
    server.use(signUpEmailTaken);
    const result = await signUpAction(
      { email: "", error: null, success: false },
      makeFormData(validFields)
    );
    expect(result.error).toBe("Email already registered");
  });

  it("returns validation error when required fields are missing", async () => {
    const result = await signUpAction(
      { email: "", error: null, success: false },
      new FormData()
    );
    expect(result.error).toMatch(RE_REQUIRED);
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
