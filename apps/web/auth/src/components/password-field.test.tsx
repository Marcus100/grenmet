// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordField } from "./password-field";

const STRENGTH = /Strength/;

describe("PasswordField", () => {
  it("shows and hides the password", () => {
    render(
      <PasswordField
        autoComplete="current-password"
        id="pw"
        label="Password"
        name="password"
      />
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("reports strength for a new password once typing starts", () => {
    render(
      <PasswordField
        autoComplete="new-password"
        id="pw"
        label="New password"
        name="password"
        showStrength
      />
    );
    expect(screen.queryByText(STRENGTH)).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    expect(screen.getByText("Use at least 12 characters.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Longer-Passw0rd-here" },
    });
    expect(screen.getByText("Strength: Strong")).toBeInTheDocument();
  });
});
