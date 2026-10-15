// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.hoisted(() => vi.fn());
const exchangeSessionForAccessToken = vi.hoisted(() => vi.fn());
class FakeAuthApiError extends Error {
  status: number;
  constructor(status: number) {
    super("api");
    this.status = status;
  }
}
vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken,
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
  readSessionCookie,
}));
vi.mock("@/app/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/app-links", () => ({
  getAppHrefs: () => ({
    admin: "https://admin.example.test",
    events: "https://events.example.test",
  }),
}));
vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  AuthHeading: ({
    title,
    children,
  }: {
    title: string;
    children?: React.ReactNode;
  }) => (
    <>
      <h1>{title}</h1>
      <p>{children}</p>
    </>
  ),
}));

import SignedOutPage from "./page";

async function show(params: Record<string, string>) {
  render(await SignedOutPage({ searchParams: Promise.resolve(params) }));
}

afterEach(() => vi.clearAllMocks());
beforeEach(() => {
  exchangeSessionForAccessToken.mockResolvedValue({});
});

describe("/signed-out", () => {
  it("says which app was left and offers to sign out everywhere", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    await show({ app: "gaa-admin" });
    expect(
      screen.getByRole("heading", { name: "You signed out of GAA Admin" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in to GAA Admin again" })
    ).toHaveProperty("href", "https://admin.example.test/");
    expect(
      screen.getByRole("button", { name: "Sign out of all apps" })
    ).toBeTruthy();
  });

  it("does not link to an app it does not know", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    await show({ app: "https://evil.example" });
    expect(
      screen.getByRole("heading", { name: "You signed out of this app" })
    ).toBeTruthy();
    expect(screen.queryByText("Sign in to this app again")).toBeNull();
    expect(document.querySelector('a[href*="evil"]')).toBeNull();
  });

  it("confirms a full sign-out and offers only sign in", async () => {
    readSessionCookie.mockResolvedValue(null);
    await show({ all: "1", app: "events" });
    expect(
      screen.getByRole("heading", { name: "You're signed out of all apps" })
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("treats a missing account session as signed out of everything", async () => {
    readSessionCookie.mockResolvedValue(null);
    await show({ app: "events" });
    expect(
      screen.getByRole("heading", { name: "You're signed out of all apps" })
    ).toBeTruthy();
  });

  it("does not claim you are still signed in when the cookie's session was revoked", async () => {
    readSessionCookie.mockResolvedValue("revoked-session");
    exchangeSessionForAccessToken.mockImplementation(() => {
      throw new FakeAuthApiError(401);
    });
    await show({ app: "gaa-admin" });
    expect(
      screen.getByRole("heading", { name: "You're signed out of all apps" })
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
