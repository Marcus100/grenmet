// @vitest-environment jsdom
import type { AccountSecurityPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountControls } from "./account-controls";
import {
  changeAccountPassword,
  replaceRecoveryCodes,
  revokeSecuritySession,
} from "./actions";

vi.mock("./actions", () => ({
  changeAccountPassword: vi.fn(),
  replaceRecoveryCodes: vi.fn(),
  revokeSecuritySession: vi.fn(),
  disableMfa: vi.fn(),
}));
const security: AccountSecurityPublic = {
  email_verified: true,
  google_configured: false,
  google_linked: false,
  totp_enabled: true,
  sessions: [
    {
      id: "session-one",
      app_name: "GAA",
      client_type: "web",
      last_used_at: "2026-09-06T00:00:00Z",
      expires_at: "2026-09-07T00:00:00Z",
    },
  ],
};
function showControls() {
  render(
    <AccountControls mfaEnabled onMfaDisabled={vi.fn()} security={security} />
  );
}
describe("account controls", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires matching passwords and signs the user out after a successful change", async () => {
    showControls();
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-long-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("New passwords must match.")
    ).toBeInTheDocument();
    expect(changeAccountPassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-long-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByRole("link", {
        name: "Sign in with your new password",
      })
    ).toHaveAttribute("href", "/");
    expect(changeAccountPassword).toHaveBeenCalledWith(
      "old-password",
      "new-long-password"
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });
  it("shows newly issued recovery codes after password and factor confirmation", async () => {
    vi.mocked(replaceRecoveryCodes).mockResolvedValue({
      codes: ["RECOVERY-CODE-ONE", "RECOVERY-CODE-TWO"],
    });
    showControls();
    fireEvent.change(screen.getByLabelText("Confirm account password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("Authenticator or recovery code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm authenticator action" })
    );
    expect(await screen.findByText("RECOVERY-CODE-ONE")).toBeInTheDocument();
    expect(replaceRecoveryCodes).toHaveBeenCalledWith("old-password", "123456");
    expect(screen.getByText("2 unused recovery codes")).toBeInTheDocument();
  });
  it("keeps a session visible when revocation fails, then removes it after success", async () => {
    vi.mocked(revokeSecuritySession).mockRejectedValueOnce(
      new Error("Offline")
    );
    showControls();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText(
        "Unable to sign out this session. You may need to sign in again."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("GAA")).toBeInTheDocument();
    vi.mocked(revokeSecuritySession).mockResolvedValueOnce({
      message: "Session signed out",
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(screen.queryByText("GAA")).not.toBeInTheDocument()
    );
    expect(revokeSecuritySession).toHaveBeenLastCalledWith("session-one");
  });
});
