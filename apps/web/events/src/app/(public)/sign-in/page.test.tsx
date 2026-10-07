import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  EVENTS_SSO_CLIENT_SECRET: undefined as string | undefined,
}));
vi.mock("@/env", () => ({ env }));
vi.mock("@barrelsgd/auth/server", () => ({
  getSafeLocalReturnTo: (value?: string) =>
    value?.startsWith("/") ? value : null,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("./sign-in-form", () => ({ SignInForm: () => <form /> }));

import SignInPage from "./page";

async function show(params: { returnTo?: string; sign_in?: string } = {}) {
  try {
    render(await SignInPage({ searchParams: Promise.resolve(params) }));
  } catch (error) {
    return (error as Error).message.replace("redirect:", "");
  }
  return null;
}

afterEach(() => {
  env.EVENTS_SSO_CLIENT_SECRET = undefined;
});

describe("Events sign-in page", () => {
  it("sends people to the Barrels account when single sign-on is on", async () => {
    env.EVENTS_SSO_CLIENT_SECRET = "x".repeat(32);
    expect(await show({ returnTo: "/events/launch" })).toBe(
      "/auth/start?returnTo=%2Fevents%2Flaunch"
    );
  });

  it("offers a retry instead of looping after a failed attempt", async () => {
    env.EVENTS_SSO_CLIENT_SECRET = "x".repeat(32);
    expect(await show({ sign_in: "expired" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Try again" }).getAttribute("href")
    ).toBe("/auth/start?returnTo=%2Fme");
  });

  it("keeps the local email-code form when single sign-on is off", async () => {
    expect(await show()).toBeNull();
    expect(screen.queryByRole("link", { name: "Try again" })).toBeNull();
  });
});
