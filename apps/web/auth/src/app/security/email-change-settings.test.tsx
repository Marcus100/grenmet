// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeEmailAction, sendEmailChangeCodeAction } from "@/app/actions";
import { EmailChangeSettings } from "./email-change-settings";

vi.mock("@/app/actions", () => ({
  changeEmailAction: vi.fn(),
  sendEmailChangeCodeAction: vi.fn(),
}));

// jsdom has no layout: the one-time-code input calls elementFromPoint when it is
// focused (autoFocus), so give it a stub. Not an app behaviour.
if (!("elementFromPoint" in document)) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => null,
  });
}

const OLD_EMAIL = "old@example.com";
const NEW_EMAIL = "new@example.com";

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
}

function submitChange() {
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
}

/** The FormData the change action received on its last call. */
function submittedFields(): FormData {
  const call = vi.mocked(changeEmailAction).mock.calls.at(-1);
  if (!call) throw new Error("changeEmailAction was not called");
  return call[1];
}

function refuseChangeWith(message: string) {
  vi.mocked(changeEmailAction).mockResolvedValue({
    error: message,
    codeSent: false,
  });
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

  it("keeps the change button at a 44px tap target on phones", () => {
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    expect(screen.getByRole("button", { name: "Change email" })).toHaveClass(
      "min-h-11",
      "md:min-h-0"
    );
  });

  it("focuses the new email field when the form opens", () => {
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    expect(screen.getByLabelText("New email address")).toHaveFocus();
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
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();

    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "secret-password");
    submitChange();

    await waitFor(() => expect(changeEmailAction).toHaveBeenCalledTimes(1));
    const fields = submittedFields();
    expect(fields.get("email")).toBe(NEW_EMAIL);
    expect(fields.get("current_password")).toBe("secret-password");
    expect(fields.has("email_code")).toBe(false);
  });

  it("shows the reason the server refused the change", async () => {
    refuseChangeWith("That email address is already in use.");
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "wrong-password");
    submitChange();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email address is already in use."
    );
  });

  it("clears the password after a refusal but keeps the typed new address", async () => {
    refuseChangeWith("Your current password is not correct.");
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "wrong-password");
    submitChange();

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New email address")).toHaveValue(NEW_EMAIL);
  });

  it("clears the emailed code after a refusal but keeps the typed new address", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: null,
      codeSent: true,
    });
    refuseChangeWith("That code is not right.");
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    fireEvent.click(screen.getByRole("radio", { name: "Email me a code" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await screen.findByRole("status");

    typeInto("New email address", NEW_EMAIL);
    typeInto("6-digit code", "123456");
    submitChange();

    await screen.findByRole("alert");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
    expect(screen.getByLabelText("New email address")).toHaveValue(NEW_EMAIL);
  });

  it("emails a code to the current address, focuses the code, then submits it without a password", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: null,
      codeSent: true,
    });
    vi.mocked(changeEmailAction).mockResolvedValue({
      error: null,
      codeSent: false,
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
    expect(screen.getByLabelText("6-digit code")).toHaveFocus();

    typeInto("New email address", NEW_EMAIL);
    typeInto("6-digit code", "123456");
    submitChange();

    await waitFor(() => expect(changeEmailAction).toHaveBeenCalledTimes(1));
    const fields = submittedFields();
    expect(fields.get("email_code")).toBe("123456");
    expect(fields.has("current_password")).toBe(false);
  });

  it("keeps the typed new address when a code could not be sent", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: "Too many codes. Try again later.",
      codeSent: false,
    });
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    typeInto("New email address", NEW_EMAIL);
    fireEvent.click(screen.getByRole("radio", { name: "Email me a code" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many codes. Try again later."
    );
    expect(screen.getByLabelText("New email address")).toHaveValue(NEW_EMAIL);
    expect(
      screen.queryByRole("button", { name: "Change email" })
    ).not.toBeInTheDocument();
  });

  it("shows one error region, the refused change, when a failed code send is also showing", async () => {
    vi.mocked(sendEmailChangeCodeAction).mockResolvedValue({
      error: "Too many codes. Try again later.",
      codeSent: false,
    });
    refuseChangeWith("That email address is already in use.");
    render(<EmailChangeSettings currentEmail={OLD_EMAIL} hasPassword />);
    openForm();
    fireEvent.click(screen.getByRole("radio", { name: "Email me a code" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many codes. Try again later."
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Use my current password" })
    );
    typeInto("New email address", NEW_EMAIL);
    typeInto("Current password", "secret-password");
    submitChange();

    // The failed code send's alert is already on screen, so a bare findByRole would
    // resolve at once with that stale alert. Wait for the refused change's own text.
    await screen.findByText("That email address is already in use.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That email address is already in use."
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
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
