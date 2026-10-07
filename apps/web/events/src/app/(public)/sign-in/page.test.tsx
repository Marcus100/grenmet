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
vi.mock("./sign-in-form", () => ({ SignInForm: () => <form /> }));

import SignInPage from "./page";

async function show(params: { returnTo?: string; sign_in?: string } = {}) {
  render(await SignInPage({ searchParams: Promise.resolve(params) }));
}

afterEach(() => {
  env.EVENTS_SSO_CLIENT_SECRET = undefined;
});

describe("Events sign-in page", () => {
  it("offers the Barrels account when single sign-on is configured", async () => {
    env.EVENTS_SSO_CLIENT_SECRET = "x".repeat(32);
    await show({ returnTo: "/events/launch" });
    const link = screen.getByRole("link", {
      name: "Continue with your Barrels account",
    });
    expect(link.getAttribute("href")).toBe(
      "/auth/start?returnTo=%2Fevents%2Flaunch"
    );
  });

  it("hides it otherwise and explains an expired link", async () => {
    await show({ sign_in: "expired" });
    expect(
      screen.queryByRole("link", { name: "Continue with your Barrels account" })
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("expired");
  });
});
