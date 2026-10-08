// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  security: vi.fn(),
  report: vi.fn(),
  settings: vi.fn((_props: { storageReady?: boolean }) => null),
}));
vi.mock("@/lib/account", () => ({ requireAccount: vi.fn() }));
vi.mock("./actions", () => ({ loadSecurity: mocks.security }));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
vi.mock("./two-step-settings", () => ({ TwoStepSettings: mocks.settings }));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  SettingsSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SettingsRow: () => null,
  StatusBadge: () => null,
}));

import SecurityPage from "./page";

beforeEach(() => vi.clearAllMocks());
it("offers a fresh challenge for an enrolled privileged account with no session proof", async () => {
  mocks.security.mockResolvedValue({
    totp_enabled: true,
    privileged_mfa_required: true,
    privileged_mfa_enforced: true,
    authenticator_storage_ready: true,
    current_session_mfa_verified: false,
  });
  render(await SecurityPage());
  expect(
    screen.getByRole("link", { name: "Sign in again with your code" })
  ).toHaveAttribute("href", "/?reauth=1");
});
it("keeps setup unavailable when the backend has not reported secure storage readiness", async () => {
  mocks.security.mockResolvedValue({
    totp_enabled: false,
    privileged_mfa_required: true,
    current_session_mfa_verified: false,
  });
  render(await SecurityPage());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "awaiting secure storage configuration"
  );
  expect(mocks.settings.mock.calls[0][0]).toMatchObject({
    storageReady: false,
  });
});

it("reports unavailable security details while keeping setup hidden", async () => {
  const error = new Error("Security service unavailable");
  mocks.security.mockRejectedValue(error);
  render(await SecurityPage());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Security details could not be loaded"
  );
  expect(mocks.report).toHaveBeenCalledWith(error, "auth/security");
  expect(mocks.settings).not.toHaveBeenCalled();
});
