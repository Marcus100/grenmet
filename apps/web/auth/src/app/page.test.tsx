// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn().mockResolvedValue("password-session"));
vi.mock("@/lib/session", () => ({
  readSessionCookie: session,
  exchangeSessionForAccessToken: vi.fn(),
  isAuthApiError: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("Unexpected auto-redirect");
  }),
}));
vi.mock("@/components/SignInForm", () => ({
  SignInForm: ({ returnTo }: { returnTo: string | null }) => (
    <div data-testid="fresh-sign-in">{returnTo}</div>
  ),
}));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: vi.fn(),
  SettingsRow: vi.fn(),
  SettingsSection: vi.fn(),
  StatusBadge: vi.fn(),
}));
vi.mock("@/components/app-directory", () => ({
  getAppDisplayName: () => "GAA Admin",
}));
vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  AuthHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/staff-access", () => ({ StaffAccess: vi.fn() }));
vi.mock("@/lib/app-links", () => ({ getAppHrefs: vi.fn() }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import Home from "./page";

it("shows a fresh sign-in despite an existing session when MFA reauthentication is requested", async () => {
  const returnTo = "/continue?app=gaa-admin&state=verified-handoff-state";
  render(
    await Home({
      searchParams: Promise.resolve({
        app: "gaa-admin",
        returnTo,
        reauth: "1",
      }),
    })
  );
  expect(session).not.toHaveBeenCalled();
  expect(screen.getByTestId("fresh-sign-in")).toHaveTextContent(returnTo);
  expect(
    screen.getByRole("heading", { name: "Sign in to GAA Admin" })
  ).toBeInTheDocument();
});
