import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch: vi.fn() }));
vi.mock("./auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("./env", () => ({ env: { NODE_ENV: "production" } }));

interface StoredCookie {
  options: Record<string, unknown>;
  value: string;
}
const jar = vi.hoisted(() => new Map<string, StoredCookie>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const stored = jar.get(name);
      return stored ? { value: stored.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.set(name, { options, value });
    },
  }),
}));

import { hasJoinIntent, rememberJoinIntent } from "./join-intent";

const STATE = "s".repeat(32);
const request = { app: "bookings", state: STATE };
const RETURN_TO = `/continue?app=bookings&state=${STATE}`;
const COOKIE = "auth_join_intent";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
});

afterEach(() => {
  jar.clear();
  vi.useRealTimers();
});

describe("join intent", () => {
  it("is accepted for the session, app and state that signed in", async () => {
    await rememberJoinIntent(RETURN_TO, "account-session");
    expect(await hasJoinIntent(request, "account-session")).toBe(true);
  });

  it("is a short-lived cookie only /continue receives, never from another site", async () => {
    await rememberJoinIntent(RETURN_TO, "account-session");
    expect(jar.get(COOKIE)?.options).toEqual({
      httpOnly: true,
      maxAge: 120,
      path: "/continue",
      sameSite: "strict",
      secure: true,
    });
    // The value holds no session secret, app key or state in the clear.
    const value = jar.get(COOKIE)?.value ?? "";
    expect(value).not.toContain("account-session");
    expect(value).not.toContain(STATE);
    expect(value).not.toContain("bookings");
  });

  it("is refused without a mark", async () => {
    expect(await hasJoinIntent(request, "account-session")).toBe(false);
  });

  it("is refused for another session, another app or another state", async () => {
    await rememberJoinIntent(RETURN_TO, "account-session");
    expect(await hasJoinIntent(request, "someone-elses-session")).toBe(false);
    expect(
      await hasJoinIntent({ app: "events", state: STATE }, "account-session")
    ).toBe(false);
    expect(
      await hasJoinIntent(
        { app: "bookings", state: "t".repeat(32) },
        "account-session"
      )
    ).toBe(false);
  });

  it("is refused once two minutes have passed, even if the cookie is replayed", async () => {
    await rememberJoinIntent(RETURN_TO, "account-session");
    vi.advanceTimersByTime(119 * 1000);
    expect(await hasJoinIntent(request, "account-session")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(await hasJoinIntent(request, "account-session")).toBe(false);
  });

  it("is refused when the expiry is edited, forged or malformed", async () => {
    await rememberJoinIntent(RETURN_TO, "account-session");
    const stored = jar.get(COOKIE);
    const [expiresAt = "", proof = ""] = (stored?.value ?? "").split(".");
    const forged = [
      `${Number(expiresAt) + 60}.${proof}`,
      // A plain hash of the same fields is not the keyed proof.
      `${expiresAt}.${createHash("sha256")
        .update(["account-session", "bookings", STATE, expiresAt].join("\n"))
        .digest("hex")}`,
      `${expiresAt}.${"0".repeat(64)}`,
      `${expiresAt}.${proof.slice(0, 32)}`,
      "not-a-mark",
      "",
    ];
    for (const value of forged) {
      jar.set(COOKIE, { options: {}, value });
      expect(await hasJoinIntent(request, "account-session")).toBe(false);
    }
  });

  it("is not written for a sign-in that is not on its way to /continue", async () => {
    await rememberJoinIntent("/security", "account-session");
    await rememberJoinIntent(null, "account-session");
    await rememberJoinIntent("/continue?app=bookings&state=short", "s");
    await rememberJoinIntent(
      `https://evil.example/continue?app=bookings&state=${STATE}`,
      "s"
    );
    expect(jar.size).toBe(0);
  });
});
