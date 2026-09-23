// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInState } from "@/app/actions-types";

const { actionState } = vi.hoisted(() => ({
  actionState: { current: {} as Record<string, unknown> },
}));

// Drive each form's rendered state directly; the actions are covered in
// src/test/sign-in-action.test.ts.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, initial: Record<string, unknown>) => [
      { ...initial, ...actionState.current },
      vi.fn(),
      false,
    ],
  };
});
vi.mock("@/app/actions", () => ({
  resetPasswordAction: vi.fn(),
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

import { ResetPasswordForm } from "./ResetPasswordForm";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

function setState(state: Partial<SignInState> | Record<string, unknown>) {
  actionState.current = state;
}

describe("SignInForm", () => {
  beforeEach(() => setState({}));

  it("hides the authenticator code until the account asks for it", () => {
    render(<SignInForm appName={null} returnTo={null} />);
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/signup");
  });

  it("offers Google before the email form", () => {
    render(<SignInForm appName={null} returnTo={null} />);
    const google = screen.getByRole("link", { name: "Continue with Google" });
    const email = screen.getByLabelText("Email address");
    const controls = Array.from(document.querySelectorAll("a, input"));
    expect(controls.indexOf(google)).toBeLessThan(controls.indexOf(email));
  });

  it("shows only the authenticator step after the MFA prompt", () => {
    setState({ email: "jane@example.com", next: "mfa" });
    render(<SignInForm appName={null} returnTo={null} />);
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Continue with Google" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Verify and sign in" })
    ).toBeInTheDocument();
  });

  it("links to email verification only when the account needs it", () => {
    setState({ error: "Verify your email first", next: "verify" });
    render(<SignInForm appName={null} returnTo={null} />);
    expect(
      screen.getByRole("link", { name: "Verify your email" })
    ).toHaveAttribute("href", "/verify-email");
  });
});

describe("SignUpForm", () => {
  beforeEach(() => setState({}));

  it("links back to sign-in rather than verification", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("sends a new account back to sign-in after signup", () => {
    setState({ success: true, email: "jane@example.com" });
    render(<SignUpForm />);
    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" })
    ).toHaveAttribute("href", "/");
  });
});

describe("ResetPasswordForm", () => {
  it("sends the user to sign in after a reset", () => {
    setState({ success: true });
    render(<ResetPasswordForm token="t" />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});
