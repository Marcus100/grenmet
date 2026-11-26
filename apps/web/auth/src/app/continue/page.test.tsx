// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);
const startHandoff = vi.hoisted(() => vi.fn());
const readSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }));
const hasJoinIntent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ readSessionCookie }));
vi.mock("@/lib/join-intent", () => ({ hasJoinIntent }));
vi.mock("@/lib/handoff", () => ({
  continuePath: ({ app, state }: { app: string; state: string }) =>
    `/continue?app=${app}&state=${state}`,
  parseHandoffRequest: (app: string | null, state: string | null) =>
    app && state && state.length >= 16 ? { app, state } : null,
  startHandoff,
}));
vi.mock("./actions", () => ({ joinApp: vi.fn() }));
vi.mock("@/app/actions", () => ({ signOutAction: vi.fn() }));
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

import ContinuePage from "./page";

const STATE = "s".repeat(32);
const NOT_YOUR_FAULT = /not something you did wrong/u;
const SUPPORT_EMAIL = /support@barrels\.gd/u;
const APP_KEY_TEXT = /\(gmsdash\)/u;
const ISNT_AVAILABLE = /isn't available/u;

function page(params: Record<string, string>) {
  return ContinuePage({ searchParams: Promise.resolve(params) });
}

async function redirectedTo(params: Record<string, string>) {
  try {
    await page(params);
  } catch (error) {
    return (error as Error).message.replace("redirect:", "");
  }
  return null;
}

afterEach(() => vi.resetAllMocks());

describe("/continue joining an instant-join app without the question", () => {
  const request = { app: "bookings", state: STATE };
  const APP_URL = "https://bookings.barrels.gd/auth/callback?code=c&state=s";

  it("joins and lands on the app when this session just signed in for it", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    hasJoinIntent.mockResolvedValue(true);
    startHandoff
      .mockResolvedValueOnce({
        kind: "join",
        label: "Barrels Bookings",
        request: false,
      })
      .mockResolvedValueOnce({ kind: "redirect", url: APP_URL });

    expect(await redirectedTo(request)).toBe(APP_URL);
    expect(hasJoinIntent).toHaveBeenCalledWith(request, "account-session");
    expect(startHandoff).toHaveBeenCalledTimes(2);
    expect(startHandoff).toHaveBeenNthCalledWith(1, request, "account-session");
    expect(startHandoff).toHaveBeenNthCalledWith(
      2,
      request,
      "account-session",
      true
    );
  });

  it("does not join on a bare link: no mark for this session, app and state", async () => {
    // Covers a missing, forged, expired or other-request mark (lib/join-intent).
    readSessionCookie.mockResolvedValue("account-session");
    hasJoinIntent.mockResolvedValue(false);
    startHandoff.mockResolvedValue({
      kind: "join",
      label: "Barrels Bookings",
      request: false,
    });

    render(await page(request));
    expect(
      screen.getByRole("heading", { name: "Join Barrels Bookings?" })
    ).toBeTruthy();
    expect(startHandoff).toHaveBeenCalledTimes(1);
    expect(startHandoff).toHaveBeenCalledWith(request, "account-session");
  });

  it("keeps the request screen for an app an administrator approves, even with a mark", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    hasJoinIntent.mockResolvedValue(true);
    startHandoff.mockResolvedValue({
      kind: "join",
      label: "GAA Admin",
      request: true,
    });

    render(await page({ app: "gaa-admin", state: STATE }));
    expect(
      screen.getByRole("heading", { name: "Join GAA Admin?" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join GAA Admin" })).toBeTruthy();
    expect(startHandoff).toHaveBeenCalledTimes(1);
    expect(hasJoinIntent).not.toHaveBeenCalled();
  });

  it("never joins for a malformed state or a signed-out visitor", async () => {
    hasJoinIntent.mockResolvedValue(true);
    readSessionCookie.mockResolvedValue("account-session");
    render(await page({ app: "bookings", state: "short" }));
    expect(
      screen.getByRole("heading", { name: "That link didn't work" })
    ).toBeTruthy();

    readSessionCookie.mockResolvedValue(null);
    await redirectedTo(request);
    expect(startHandoff).not.toHaveBeenCalled();
    expect(hasJoinIntent).not.toHaveBeenCalled();
  });

  it("shows what the join answered when it is refused", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    hasJoinIntent.mockResolvedValue(true);
    startHandoff
      .mockResolvedValueOnce({
        kind: "join",
        label: "Barrels Bookings",
        request: false,
      })
      .mockResolvedValueOnce({
        kind: "denied",
        label: "Barrels Bookings",
        detail: "This account can't sign in to this app.",
      });

    render(await page(request));
    expect(
      screen.getByRole("heading", {
        name: "You don't have access to Barrels Bookings",
      })
    ).toBeTruthy();
  });
});

describe("/continue", () => {
  it("sends signed-out visitors to sign in, then back here", async () => {
    readSessionCookie.mockResolvedValue(null);
    expect(await redirectedTo({ app: "events", state: STATE })).toBe(
      `/?app=events&returnTo=${encodeURIComponent(
        `/continue?app=events&state=${STATE}`
      )}`
    );
    expect(startHandoff).not.toHaveBeenCalled();
  });

  it("hands a signed-in account straight back to the app", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({
      kind: "redirect",
      url: "https://events.barrels.gd/auth/callback?code=c&state=s",
    });
    expect(await redirectedTo({ app: "events", state: STATE })).toBe(
      "https://events.barrels.gd/auth/callback?code=c&state=s"
    );
  });

  it("asks once before joining a public app", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({ kind: "join", label: "Barrels Events" });
    render(await page({ app: "events", state: STATE }));
    expect(
      screen.getByRole("heading", { name: "Join Barrels Events?" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Join Barrels Events" })
    ).toBeTruthy();
  });

  it("explains that joining a staff app asks an administrator", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({
      kind: "join",
      label: "GAA Admin",
      request: true,
    });
    render(await page({ app: "gaa-admin", state: STATE }));
    expect(
      screen.getByText(
        "An administrator approves access to GAA Admin. Join to send your request."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join GAA Admin" })).toBeTruthy();
  });

  it("shows a waiting notice once access is requested", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({ kind: "pending", label: "GAA Admin" });
    render(await page({ app: "gaa-admin", state: STATE }));
    expect(
      screen.getByRole("heading", {
        name: "Waiting for approval to use GAA Admin",
      })
    ).toBeTruthy();
  });

  it("tells a person the app is not set up yet, with a way out", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({ kind: "unavailable" });
    render(await page({ app: "gmsdash", state: STATE }));

    expect(
      screen.getByRole("heading", {
        name: "This app is not set up for Barrels sign-in yet",
      })
    ).toBeTruthy();
    expect(screen.getByText(NOT_YOUR_FAULT)).toBeTruthy();
    expect(screen.getByText(SUPPORT_EMAIL)).toBeTruthy();
    expect(screen.getByText(APP_KEY_TEXT)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Go to your account" })
        .getAttribute("href")
    ).toBe("/");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByText(ISNT_AVAILABLE)).toBeNull();
  });

  it("explains a missing grant and a broken link", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({
      kind: "denied",
      label: "GAA Admin",
      detail: "No access",
    });
    render(await page({ app: "gaa-admin", state: STATE }));
    expect(
      screen.getByRole("heading", {
        name: "You don't have access to GAA Admin",
      })
    ).toBeTruthy();

    render(await page({ app: "events", state: "short" }));
    expect(
      screen.getByRole("heading", { name: "That link didn't work" })
    ).toBeTruthy();
  });
});

it("offers an explicit fresh challenge while preserving the handoff", async () => {
  readSessionCookie.mockResolvedValue("password-only-session");
  startHandoff.mockResolvedValue({ kind: "mfa-sign-in" });
  render(await page({ app: "gaa-admin", state: STATE }));
  const href = screen
    .getByRole("link", { name: "Sign in again" })
    .getAttribute("href");
  const target = new URL(href ?? "", "https://auth.example.com");
  expect(target.searchParams.get("reauth")).toBe("1");
  expect(target.searchParams.get("returnTo")).toBe(
    `/continue?app=gaa-admin&state=${STATE}`
  );
});
