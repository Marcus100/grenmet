// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeEmailAction, sendEmailChangeCodeAction } from "@/app/actions";
import { EmailChangeSettings } from "./email-change-settings";

vi.mock("@/app/actions", () => ({
  changeEmailAction: vi.fn(),
  sendEmailChangeCodeAction: vi.fn(),
}));

const OLD_EMAIL = "old@example.com";
const NEW_EMAIL = "new@example.com";

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
}

/** The FormData the change action received on its last call. */
function submittedFields(): FormData {
  const call = vi.mocked(changeEmailAction).mock.calls.at(-1);
  if (!call) throw new Error("changeEmailAction was not called");
  return call[1];
}

describe("EmailChangeSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the address they sign in with and keeps the form closed until asked", () => {
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    expect(
      screen.getByText(`You sign in with ${OLD_EMAIL}.`)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New email address")).toBeNull();

    openForm();
    expect(screen.getByLabelText("New email address")).toBeInTheDocument();
  });

  it("tells the person the old address will be notified", () => {
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    expect(
      screen.getByText(
        `We will email ${OLD_EMAIL} to tell it the address has changed.`,
        { exact: false }
      )
    ).toBeInTheDocument();
  });

  it("submits the new address with the current password", async () => {
    vi.mocked(changeEmailAction).mockResolvedValue({
      error: null,
      codeSent: false,
      saved: false,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();

    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "secret-password");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(changeEmailAction).toHaveBeenCalledTimes(1));
    const fields = submittedFields();
    expect(fields.get("email")).toBe(NEW_EMAIL);
    expect(fields.get("current_password")).toBe("secret-password");
    expect(fields.has("email_code")).toBe(false);
  });

  it("shows the reason the server refused the change", async () => {
    vi.mocked(changeEmailAction).mockResolvedValue({
      error: "That email address is already in use.",
      codeSent: false,
      saved: false,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email address is already in use."
    );
    // The typed address survives a refusal.
    expect(screen.getByLabelText("New email address")).toHaveValue(NEW_EMAIL);
  });

  it("confirms the change and asks the person to sign in again", async () => {
    vi.mocked(changeEmailAction).mockResolvedValue({
      error: null,
      codeSent: false,
      saved: true,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "secret-password");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(`Your email address is now ${NEW_EMAIL}.`);
    expect(status).toHaveTextContent("Every device has been signed out.");
    expect(
      screen.queryByRole("button", { name: "Change email" })
    ).not.toBeInTheDocument();
  });

  it("emails a code to the current address, then submits it without a password", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: null,
      codeSent: true,
      saved: false,
    });
    vi.mocked(changeEmailAction).mockResolvedValue({
      error: null,
      codeSent: false,
      saved: false,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    fireEvent.click(screen.getByRole("radio", { name: "Email me a code" }));
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(
      await screen.findByText(
        `We sent a 6-digit code to ${OLD_EMAIL}. Enter it below.`
      )
    ).toBeInTheDocument();
    expect(sendEmailChangeCodeAction).toHaveBeenCalledTimes(1);

    typeInto("New email address", NEW_EMAIL);
    typeInto("6-digit code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(changeEmailAction).toHaveBeenCalledTimes(1));
    const fields = submittedFields();
    expect(fields.get("email_code")).toBe("123456");
    expect(fields.has("current_password")).toBe(false);
  });

  it("shows the reason when a code could not be sent", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: "Too many codes. Try again later.",
      codeSent: false,
      saved: false,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    fireEvent.click(screen.getByRole("radio", { name: "Email me a code" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many codes. Try again later."
    );
    expect(
      screen.queryByRole("button", { name: "Change email" })
    ).not.toBeInTheDocument();
  });

  it("uses a code only, and waits for one before offering the submit, when the account has no password", () => {
    render(
      <EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword={false} />
    );
    openForm();

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `This account has no password. We check it is you with a code we email to ${OLD_EMAIL}.`,
        { exact: false }
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change email" })
    ).not.toBeInTheDocument();
  });
});
