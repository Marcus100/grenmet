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
vi.mock("@/lib/session", () => ({ readSessionCookie }));
vi.mock("@/lib/handoff", () => ({
  continuePath: ({ app, state }: { app: string; state: string }) =>
    `/continue?app=${app}&state=${state}`,
  parseHandoffRequest: (app: string | null, state: string | null) =>
    app && state && state.length >= 16 ? { app, state } : null,
  startHandoff,
}));
vi.mock("./actions", () => ({ joinApp: vi.fn() }));
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

afterEach(() => vi.clearAllMocks());

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

  it("directs unverified administrators to email verification", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    startHandoff.mockResolvedValue({ kind: "verify-email" });
    render(await page({ app: "cms", state: STATE }));
    expect(
      screen.getByRole("heading", { name: "Verify your email address" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Verify email" }).getAttribute("href")
    ).toBe("/verify-email");
    expect(
      screen.queryByText(
        "Ask an administrator to give your account access, then try again."
      )
    ).toBeNull();
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
