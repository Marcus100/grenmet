// @vitest-environment jsdom

import { AuthApiError } from "@barrelsgd/auth";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

const exchange = vi.hoisted(() => vi.fn());
const staffCheck = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-session", () => ({
  isAuthApiError: (error: unknown) => error instanceof AuthApiError,
  authApiFetch: staffCheck,
  readSessionCookie: vi.fn().mockResolvedValue("admin-session"),
  exchangeSessionForAccessToken: exchange,
}));
vi.mock("@/lib/auth-config", () => ({
  getAuthConfig: () => ({ authAppUrl: "https://auth.example.com" }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  staffCheck.mockResolvedValue({});
});

describe("shared staff MFA admission", () => {
  it.each(["/hr", "/cap", "/wxwatch", "/wxproducts", "/salesbus"])(
    "shows actionable enrolment for %s without exposing its content",
    async (path) => {
      exchange.mockRejectedValue(
        new AuthApiError(
          403,
          "Set up two-step verification and save recovery codes in account security before using privileged staff tools"
        )
      );
      render(await AdminLayout({ children: <p>{path} private content</p> }));
      expect(
        screen.getByRole("heading", { name: "Two-step verification required" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Open account security" })
      ).toHaveAttribute("href", "https://auth.example.com/security");
      expect(
        screen.queryByText(`${path} private content`)
      ).not.toBeInTheDocument();
    }
  );
  it("offers a fresh sign-in when enrolment exists but session proof is absent", async () => {
    exchange.mockRejectedValue(
      new AuthApiError(
        403,
        "Sign in again with your authenticator or recovery code before using privileged staff tools"
      )
    );
    render(await AdminLayout({ children: <p>private content</p> }));
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/signin"
    );
  });
});

it("checks staff admission for a legacy account-session cookie", async () => {
  exchange.mockResolvedValue({
    access_token: "account-token",
    user: { email: "admin@example.com", full_name: "Admin" },
  });
  staffCheck.mockRejectedValue(
    new AuthApiError(
      403,
      "Sign in again with your authenticator or recovery code before using privileged staff tools"
    )
  );
  render(await AdminLayout({ children: <p>private legacy content</p> }));
  expect(staffCheck).toHaveBeenCalledWith(
    "/login/test-token",
    expect.anything(),
    { method: "POST", accessToken: "account-token" }
  );
  expect(screen.queryByText("private legacy content")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Sign in again" })
  ).toBeInTheDocument();
});
