import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  WEATHER_SHOW_SIGN_IN: false,
  WEATHER_SSO_CLIENT_SECRET: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env }));

import { signInEnabled, signInVisible } from "@/lib/auth-config";

afterEach(() => {
  env.WEATHER_SHOW_SIGN_IN = false;
  env.WEATHER_SSO_CLIENT_SECRET = undefined;
});

describe("signInVisible", () => {
  it("is off by default, so the Sign in button stays hidden", () => {
    expect(signInVisible()).toBe(false);
  });

  it("follows WEATHER_SHOW_SIGN_IN when it is turned on", () => {
    env.WEATHER_SHOW_SIGN_IN = true;
    expect(signInVisible()).toBe(true);
  });

  it("does not change whether sign-in itself is enabled", () => {
    env.WEATHER_SSO_CLIENT_SECRET = "x".repeat(32);
    expect(signInVisible()).toBe(false);
    expect(signInEnabled()).toBe(true);
  });
});
