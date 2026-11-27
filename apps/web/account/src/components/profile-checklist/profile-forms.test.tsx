import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveNameAction, savePhoneAction } = vi.hoisted(() => ({
  saveNameAction: vi.fn(),
  savePhoneAction: vi.fn(),
}));
vi.mock("@/app/profile/actions", () => ({ saveNameAction, savePhoneAction }));

import { NameForm } from "./name-form";
import { PhoneForm } from "./phone-form";

const PHONE_SENTENCE =
  "Enter the phone number with its country code, for example +1 473 440 1234";

const VERIFY_WORD = /verif/iu;
const COUNTRY_CODE_HINT = /\+1 473/u;
const REMOVE_HINT = /Leave this blank to remove/u;

beforeEach(() => {
  saveNameAction.mockReset();
  savePhoneAction.mockReset();
});
afterEach(cleanup);

function submit(buttonName: string): void {
  const form = screen.getByRole("button", { name: buttonName }).closest("form");
  if (!form) throw new Error("form missing");
  fireEvent.submit(form);
}

describe("NameForm", () => {
  it("labels both fields and starts from the stored name", () => {
    render(<NameForm firstName="Kezia" lastName="Mitchell" />);

    expect(screen.getByLabelText("First name")).toHaveValue("Kezia");
    expect(screen.getByLabelText("Last name (optional)")).toHaveValue(
      "Mitchell"
    );
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("shows a refused field's reason beside it and keeps what was typed", async () => {
    saveNameAction.mockResolvedValue({
      fieldErrors: { last_name: "Use 100 characters or fewer." },
      formError: null,
      values: { first_name: "Kezia", last_name: "" },
    });
    render(<NameForm firstName="" lastName="" />);

    submit("Save name");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Use 100 characters or fewer.");
    const last = screen.getByLabelText("Last name (optional)");
    expect(last).toHaveAttribute("aria-invalid", "true");
    expect(last).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByLabelText("First name")).not.toHaveAttribute(
      "aria-invalid"
    );
    await waitFor(() =>
      expect(screen.getByLabelText("First name")).toHaveValue("Kezia")
    );
  });

  it("shows a failed save as one plain sentence", async () => {
    saveNameAction.mockResolvedValue({
      fieldErrors: {},
      formError: "Your name could not be saved. Try again.",
      values: { first_name: "Kezia", last_name: "Mitchell" },
    });
    render(<NameForm firstName="" lastName="" />);

    submit("Save name");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your name could not be saved. Try again."
    );
  });
});

describe("PhoneForm", () => {
  it("hints the country code and offers removal only when a number is stored", () => {
    const { unmount } = render(<PhoneForm phone="" />);
    const empty = screen.getByLabelText("Phone number");
    expect(empty).toHaveAttribute("placeholder", "+1 473 440 1234");
    expect(empty).toHaveAttribute("type", "tel");
    expect(empty).toHaveAccessibleDescription(COUNTRY_CODE_HINT);
    expect(screen.queryByText(REMOVE_HINT)).toBeNull();
    unmount();

    render(<PhoneForm phone="+14734401234" />);
    expect(screen.getByLabelText("Phone number")).toHaveValue("+14734401234");
    expect(screen.getByText(REMOVE_HINT)).toBeInTheDocument();
    // Nothing is said about verifying the number.
    expect(screen.queryByText(VERIFY_WORD)).toBeNull();
  });

  it("shows the API's reason beside the field", async () => {
    savePhoneAction.mockResolvedValue({
      fieldErrors: { phone: PHONE_SENTENCE },
      formError: null,
      values: { phone: "440 1234" },
    });
    render(<PhoneForm phone="" />);

    submit("Save phone number");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(PHONE_SENTENCE);
    const field = screen.getByLabelText("Phone number");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toContain(alert.id);
  });
});
