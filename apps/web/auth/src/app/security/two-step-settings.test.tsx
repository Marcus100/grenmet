// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateMfa,
  beginMfa,
  disableMfa,
  replaceRecoveryCodes,
} from "./actions";
import { TwoStepSettings } from "./two-step-settings";

vi.mock("./actions", () => ({
  activateMfa: vi.fn(),
  beginMfa: vi.fn(),
  disableMfa: vi.fn(),
  replaceRecoveryCodes: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./qr-code", () => ({
  QrCode: ({ value }: { value: string }) => <p>QR for {value}</p>,
}));

const EIGHT_LEFT = /8 unused codes left/;

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("TwoStepSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("walks through scan, confirm and recovery codes", async () => {
    vi.mocked(beginMfa).mockResolvedValue({
      secret: "SETUP-KEY",
      provisioning_uri: "otpauth://totp/test",
    });
    vi.mocked(activateMfa).mockResolvedValue({ enabled: true });
    vi.mocked(replaceRecoveryCodes).mockResolvedValue({
      codes: ["CODE-ONE", "CODE-TWO"],
    });
    render(<TwoStepSettings enabled={false} recoveryCodesRemaining={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(
      await screen.findByText("QR for otpauth://totp/test")
    ).toBeInTheDocument();
    expect(screen.getByText("SETUP-KEY")).toBeInTheDocument();

    typeInto("6-digit code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(activateMfa).toHaveBeenCalledWith("123456"));

    expect(
      await screen.findByText("Two-step verification is on")
    ).toBeInTheDocument();
    typeInto("Account password", "secret-password");
    typeInto("New 6-digit code", "654321");
    fireEvent.click(
      screen.getByRole("button", { name: "Create recovery codes" })
    );
    expect(await screen.findByText("CODE-ONE")).toBeInTheDocument();
    expect(replaceRecoveryCodes).toHaveBeenCalledWith(
      "secret-password",
      "654321"
    );
    expect(screen.queryByText("SETUP-KEY")).not.toBeInTheDocument();
  });

  it("keeps the scan step open when the code is rejected", async () => {
    vi.mocked(beginMfa).mockResolvedValue({
      secret: "SETUP-KEY",
      provisioning_uri: "otpauth://totp/test",
    });
    vi.mocked(activateMfa).mockRejectedValue(new Error("bad"));
    render(<TwoStepSettings enabled={false} recoveryCodesRemaining={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    await screen.findByText("SETUP-KEY");
    typeInto("6-digit code", "000000");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code was not accepted"
    );
    expect(screen.getByText("SETUP-KEY")).toBeInTheDocument();
  });

  it("asks for password and code before turning two-step off", async () => {
    vi.mocked(disableMfa).mockResolvedValue({ enabled: false });
    render(<TwoStepSettings enabled recoveryCodesRemaining={8} />);
    expect(screen.getByText(EIGHT_LEFT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    typeInto("Account password", "secret-password");
    typeInto("Authenticator code", "123456");
    fireEvent.click(
      screen.getByRole("button", { name: "Turn off two-step verification" })
    );
    await waitFor(() =>
      expect(disableMfa).toHaveBeenCalledWith("secret-password", "123456")
    );
    expect(
      await screen.findByRole("button", { name: "Set up" })
    ).toBeInTheDocument();
  });
});
