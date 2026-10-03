// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
