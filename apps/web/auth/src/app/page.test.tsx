// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  SignInForm: ({
    codeHref,
    returnTo,
  }: {
    codeHref: string | null;
    returnTo: string | null;
  }) => (
    <div data-code-href={codeHref ?? ""} data-testid="fresh-sign-in">
      {returnTo}
    </div>
  ),
}));
vi.mock("@/components/EmailCodeForm", () => ({
  EmailCodeForm: ({ passwordHref }: { passwordHref: string | null }) => (
    <div data-testid="code-first-sign-in">{passwordHref}</div>
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

import Home, { generateMetadata } from "./page";

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

it("leads with the emailed code and links to the password form", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({
        app: "gaa-admin",
        returnTo: "/dashboard",
      }),
    })
  );
  expect(screen.queryByTestId("fresh-sign-in")).toBeNull();
  const code = screen.getByTestId("code-first-sign-in");
  expect(code).toHaveTextContent(
    "/?app=gaa-admin&method=password&returnTo=%2Fdashboard"
  );
});

it("hides the emailed-code link on a reauthentication step", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({
        reauth: "1",
        returnTo: "/continue?app=gaa-admin&state=s",
      }),
    })
  );
  const form = screen.getByTestId("fresh-sign-in");
  expect(form).toHaveAttribute("data-code-href", "");
});

it("offers the emailed-code link on a plain password request", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({
        method: "password",
        returnTo: "/dashboard",
      }),
    })
  );
  expect(screen.getByTestId("fresh-sign-in")).toHaveAttribute(
    "data-code-href",
    "/?returnTo=%2Fdashboard"
  );
});

it("keeps the password form when the password method is asked for", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({
        method: "password",
        returnTo: "/dashboard",
      }),
    })
  );
  expect(screen.queryByTestId("code-first-sign-in")).toBeNull();
  expect(screen.getByTestId("fresh-sign-in")).toHaveTextContent("/dashboard");
});

it("tells the person their email changed, from a fixed notice code only", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({ notice: "email-changed" }),
    })
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Your email address has changed. Sign in with the new address."
  );
});

it("shows nothing for an unknown notice code and never echoes it", async () => {
  render(
    await Home({
      searchParams: Promise.resolve({ notice: "<script>alert(1)</script>" }),
    })
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(document.body.textContent).not.toContain("alert(1)");
});

describe("sign-in page title", () => {
  it("is 'Sign in to <app>' for a signed-out visitor, the same wording as the heading", async () => {
    session.mockResolvedValueOnce(null);
    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ app: "gaa-admin" }),
      })
    ).resolves.toEqual({ title: "Sign in to GAA Admin" });
  });

  it("is 'Your account' when a session cookie is present, but sign-in on reauthentication", async () => {
    session.mockResolvedValueOnce("password-session");
    await expect(
      generateMetadata({ searchParams: Promise.resolve({}) })
    ).resolves.toEqual({ title: "Your account" });
    session.mockResolvedValueOnce("password-session");
    await expect(
      generateMetadata({ searchParams: Promise.resolve({ reauth: "1" }) })
    ).resolves.toEqual({ title: "Sign in to GAA Admin" });
  });
});
