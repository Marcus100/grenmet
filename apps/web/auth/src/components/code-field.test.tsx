// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeField } from "./code-field";

describe("CodeField", () => {
  it("switches between the six-digit code and a recovery code", () => {
    render(
      <CodeField
        allowRecovery
        id="code"
        label="Authenticator code"
        name="code"
      />
    );
    expect(screen.getByLabelText("Authenticator code")).toHaveAttribute(
      "maxLength",
      "6"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use a recovery code instead" })
    );
    expect(screen.getByLabelText("Recovery code")).toHaveAttribute(
      "maxLength",
      "64"
    );
  });

  it("hides the recovery option where it isn't accepted", () => {
    render(<CodeField id="code" label="6-digit code" name="code" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a numeric one-time-code field, so phones offer the emailed code", () => {
    render(<CodeField id="code" label="Email code" name="code" />);
    const input = screen.getByLabelText("Email code");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it.each(["574 554", "574-554", " 574554 "])(
    "accepts a pasted code written as %j",
    (pasted) => {
      render(<CodeField id="code" label="Email code" name="code" />);
      const input = screen.getByLabelText("Email code");
      fireEvent.paste(input, {
        clipboardData: { getData: () => pasted },
      });
      expect(input).toHaveValue("574554");
    }
  );

  it("submits the form when the sixth digit is in, and not before", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <CodeField id="code" label="Email code" name="code" submitOnComplete />
      </form>
    );
    const input = screen.getByLabelText("Email code");
    fireEvent.change(input, { target: { value: "57455" } });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "574554" } });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("leaves submitting to the button unless asked", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <CodeField id="code" label="Email code" name="code" />
      </form>
    );
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "574554" },
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
