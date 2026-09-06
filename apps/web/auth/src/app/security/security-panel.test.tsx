// @vitest-environment jsdom
import type { AccountSecurityPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { activateMfa, beginMfa } from "./actions";
import { SecurityPanel } from "./security-panel";

vi.mock("./actions", () => ({ beginMfa: vi.fn(), activateMfa: vi.fn() }));
const security: AccountSecurityPublic = {
  email_verified: false,
  google_configured: false,
  google_linked: false,
  totp_enabled: false,
  sessions: [],
};

describe("account security", () => {
  it("shows actual pending verification and Google configuration", () => {
    render(<SecurityPanel security={security} />);
    expect(screen.getByText("Verification pending")).toBeInTheDocument();
    expect(
      screen.getByText("Google sign-in is awaiting service configuration.")
    ).toBeInTheDocument();
  });
  it("enables the authenticator only after confirming a code", async () => {
    vi.mocked(beginMfa).mockResolvedValue({
      secret: "TEST-SETUP-KEY",
      provisioning_uri: "otpauth://test",
    });
    vi.mocked(activateMfa).mockResolvedValue({ enabled: true });
    render(<SecurityPanel security={security} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Set up authenticator" })
    );
    expect(await screen.findByText("TEST-SETUP-KEY")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Current six-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm authenticator" })
    );
    await waitFor(() => expect(activateMfa).toHaveBeenCalledWith("123456"));
    expect(
      await screen.findByText("Two-factor authentication is enabled.")
    ).toBeInTheDocument();
    expect(screen.queryByText("TEST-SETUP-KEY")).not.toBeInTheDocument();
  });
});
