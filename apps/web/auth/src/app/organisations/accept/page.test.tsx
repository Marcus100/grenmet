// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);
const readSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/session", () => ({ readSessionCookie }));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  AuthHeading: ({
    children,
    title,
  }: {
    children?: React.ReactNode;
    title: string;
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  ),
}));

import AcceptInvitationPage from "./page";

async function show(params: Record<string, string>) {
  render(await AcceptInvitationPage({ searchParams: Promise.resolve(params) }));
}

afterEach(() => vi.clearAllMocks());

describe("/organisations/accept", () => {
  it("sends a signed-out visitor to sign in and back to the same link", async () => {
    readSessionCookie.mockResolvedValue(null);
    await expect(show({ token: "abc_DEF-123456" })).rejects.toMatchObject({
      message: `redirect:/?returnTo=${encodeURIComponent("/organisations/accept?token=abc_DEF-123456")}`,
    });
  });

  it("carries the token in a hidden field that the action posts", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    await show({ token: "abc_DEF-123456" });
    const field = document.querySelector<HTMLInputElement>(
      'input[name="token"]'
    );
    expect(field?.type).toBe("hidden");
    expect(field?.value).toBe("abc_DEF-123456");
    expect(
      screen.getByRole("button", { name: "Accept invitation" })
    ).toBeTruthy();
  });

  it("offers no accept button without a token", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    await show({});
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Open the link from your invitation email to accept it.")
    ).toBeTruthy();
  });

  it("explains a wrong-email refusal with fixed text", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    await show({ token: "abc_DEF-123456", notice: "wrong-email" });
    expect(screen.getByRole("alert").textContent).toContain(
      "different email address"
    );
  });
});
