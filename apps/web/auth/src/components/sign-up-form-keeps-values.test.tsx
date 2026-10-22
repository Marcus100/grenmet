// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const signUpAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({ signUpAction }));

import { SignUpForm } from "./SignUpForm";

describe("SignUpForm with the real action state", () => {
  it("keeps the typed names and email when the sign-up is refused", async () => {
    signUpAction.mockResolvedValue({
      email: "jane@example.com",
      error: "That username is taken.",
      success: false,
    });
    render(<SignUpForm />);
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "janesmith" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(document.querySelector("#password") as HTMLInputElement, {
      target: { value: "correct horse battery" },
    });
    fireEvent.change(
      document.querySelector("#confirm_password") as HTMLInputElement,
      { target: { value: "correct horse battery" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("That username is taken.");
    expect(screen.getByLabelText("First name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Last name")).toHaveValue("Smith");
    expect(screen.getByLabelText("Username")).toHaveValue("janesmith");
    expect(screen.getByLabelText("Work email")).toHaveValue("jane@example.com");
  });
});
