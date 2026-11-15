// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInState } from "@/app/actions-types";

const { actionState, formAction, pendingNow } = vi.hoisted(() => ({
  actionState: { current: {} as Record<string, unknown> },
  // One stable spy for the email-code action, so tests can read what was sent.
  formAction: vi.fn(),
  // Set to true while a test simulates a send in flight.
  pendingNow: { current: false },
}));

// Drive each form's rendered state directly; the actions are covered in
// src/test/sign-in-action.test.ts and src/app/code/actions.test.ts.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, initial: Record<string, unknown>) => [
      { ...initial, ...actionState.current },
      formAction,
      pendingNow.current,
    ],
  };
});
vi.mock("@/app/actions", () => ({
  resetPasswordAction: vi.fn(),
  signInAction: vi.fn(),
}));
vi.mock("@/app/code/actions", () => ({ emailCodeAction: vi.fn() }));
// The OTP input reads layout APIs jsdom does not have, so the field is stubbed.
vi.mock("@/components/code-field", () => ({
  CodeField: ({ id, label }: { id: string; label: string }) => (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} />
    </>
  ),
}));

import { EmailCodeForm } from "./EmailCodeForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { SignInForm } from "./SignInForm";

function setState(state: Partial<SignInState> | Record<string, unknown>) {
  actionState.current = state;
}

const CODE_HREF = "/?returnTo=%2Fdashboard" as Route;
const RESEND_BUTTON = /Send a new code/u;

describe("SignInForm (password)", () => {
  beforeEach(() => setState({}));

  it("hides the authenticator code until the account asks for it", () => {
    render(<SignInForm appName={null} codeHref={CODE_HREF} returnTo={null} />);
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/signup");
  });

  it("offers Google before the email form", () => {
    render(<SignInForm appName={null} codeHref={CODE_HREF} returnTo={null} />);
    const google = screen.getByRole("link", { name: "Continue with Google" });
    const email = screen.getByLabelText("Email address");
    const controls = Array.from(document.querySelectorAll("a, input"));
    expect(controls.indexOf(google)).toBeLessThan(controls.indexOf(email));
  });

  it("links back to the emailed code under the sign-in button", () => {
    render(<SignInForm appName={null} codeHref={CODE_HREF} returnTo={null} />);
    expect(
      screen.getByRole("link", { name: "Email me a code instead" })
    ).toHaveAttribute("href", CODE_HREF);
  });

  it("hides the emailed-code link during a reauthentication step", () => {
    render(<SignInForm appName={null} codeHref={null} returnTo={null} />);
    expect(
      screen.queryByRole("link", { name: "Email me a code instead" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows only the authenticator step after the MFA prompt", () => {
    setState({ email: "jane@example.com", next: "mfa" });
    render(<SignInForm appName={null} codeHref={CODE_HREF} returnTo={null} />);
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Continue with Google" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Verify and sign in" })
    ).toBeInTheDocument();
  });

  it("shows sign-in errors without asking for email verification", () => {
    setState({ error: "Incorrect email or password", next: null });
    render(<SignInForm appName={null} codeHref={CODE_HREF} returnTo={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrect email or password"
    );
    expect(
      screen.queryByRole("link", { name: "Verify your email" })
    ).toBeNull();
  });
});

describe("EmailCodeForm (code first)", () => {
  beforeEach(() => {
    setState({});
    formAction.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the emailed-code button before the password link", () => {
    render(
      <EmailCodeForm
        passwordHref={"/?method=password" as Route}
        returnTo={null}
      />
    );
    const button = screen.getByRole("button", { name: "Email me a code" });
    const password = screen.getByRole("link", { name: "Use password instead" });
    const controls = Array.from(document.querySelectorAll("button, a"));
    expect(controls.indexOf(button)).toBeLessThan(controls.indexOf(password));
  });

  it("offers the password link with the return address kept", () => {
    render(
      <EmailCodeForm
        passwordHref={"/?method=password&returnTo=%2Fapps%2Fx" as Route}
        returnTo="/apps/x"
      />
    );
    expect(
      screen.getByRole("link", { name: "Use password instead" })
    ).toHaveAttribute("href", "/?method=password&returnTo=%2Fapps%2Fx");
  });

  it("hides the password link when there is no password (sign-up)", () => {
    render(<EmailCodeForm purpose="sign-up" returnTo={null} />);
    expect(
      screen.queryByRole("link", { name: "Use password instead" })
    ).toBeNull();
  });

  it("names the final button for sign-up", () => {
    setState({ email: "jane@example.com", step: "code" });
    render(<EmailCodeForm purpose="sign-up" returnTo={null} />);
    expect(
      screen.getByRole("button", { name: "Create account" })
    ).toBeInTheDocument();
  });

  it("holds 'Send a new code' until the server's cooldown has passed", () => {
    vi.useFakeTimers();
    setState({
      email: "jane@example.com",
      resendAfterSeconds: 60,
      step: "code",
    });
    render(<EmailCodeForm returnTo={null} />);

    const waiting = screen.getByRole("button", {
      name: "Send a new code in 60 seconds",
    });
    expect(waiting).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(
      screen.getByRole("button", { name: "Send a new code in 1 second" })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole("button", { name: "Send a new code" })
    ).toBeEnabled();
  });

  it("sends the same address again with no code when asked for a new one", () => {
    vi.useFakeTimers();
    setState({
      email: "jane@example.com",
      resendAfterSeconds: 60,
      step: "code",
    });
    render(<EmailCodeForm returnTo="/apps/x" />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));

    expect(formAction).toHaveBeenCalledTimes(1);
    const sent = formAction.mock.calls[0]?.[0] as FormData;
    expect(sent.get("email")).toBe("jane@example.com");
    expect(sent.get("returnTo")).toBe("/apps/x");
    expect(sent.get("code")).toBeNull();
  });

  it("starts again with an empty address when the person changes it", () => {
    setState({ email: "jane@example.com", step: "code" });
    render(<EmailCodeForm returnTo={null} />);
    expect(screen.getByText("Email code")).toBeInTheDocument();

    // A remount reads the action's initial state, as a fresh page would.
    setState({});
    fireEvent.click(
      screen.getByRole("button", { name: "Use a different email" })
    );

    expect(screen.queryByText("Email code")).toBeNull();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Email me a code" })
    ).toBeInTheDocument();
  });

  it("offers the resend and change-email controls only on the code step", () => {
    render(<EmailCodeForm returnTo={null} />);
    expect(screen.queryByRole("button", { name: RESEND_BUTTON })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use a different email" })
    ).toBeNull();
  });
});

describe("EmailCodeForm resend and focus", () => {
  const sentState = {
    email: "jane@example.com",
    resendAfterSeconds: 60,
    step: "code",
  };

  beforeEach(() => {
    setState({});
    formAction.mockClear();
    pendingNow.current = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    pendingNow.current = false;
  });

  // Simulates a resend finishing: the action is pending, then settles with a
  // fresh state object carrying the same window.
  function completeResend(rerender: () => void) {
    pendingNow.current = true;
    rerender();
    pendingNow.current = false;
    setState(sentState);
    rerender();
  }

  it("restarts the 60-second countdown on every resend", () => {
    vi.useFakeTimers();
    setState(sentState);
    const { rerender } = render(<EmailCodeForm returnTo={null} />);
    const rerenderForm = () => rerender(<EmailCodeForm returnTo={null} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    completeResend(rerenderForm);

    expect(
      screen.getByRole("button", { name: "Send a new code in 60 seconds" })
    ).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(
      screen.getByRole("button", { name: "Send a new code" })
    ).toBeEnabled();

    // A second resend starts a fresh 60 seconds, not the rest of the first.
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    completeResend(rerenderForm);

    expect(
      screen.getByRole("button", { name: "Send a new code in 60 seconds" })
    ).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(
      screen.getByRole("button", { name: "Send a new code in 1 second" })
    ).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole("button", { name: "Send a new code" })
    ).toBeEnabled();
    expect(formAction).toHaveBeenCalledTimes(2);
  });

  it("announces a new code and moves focus to the code field after a resend", () => {
    vi.useFakeTimers();
    setState(sentState);
    const { rerender } = render(<EmailCodeForm returnTo={null} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    completeResend(() => rerender(<EmailCodeForm returnTo={null} />));

    expect(
      screen.getByText("New code sent. Check your email.")
    ).toBeInTheDocument();
    expect(document.getElementById("code")).toHaveFocus();
  });

  it("keeps the error and the focus when a resend is refused", () => {
    vi.useFakeTimers();
    setState(sentState);
    const { rerender } = render(<EmailCodeForm returnTo={null} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    pendingNow.current = true;
    rerender(<EmailCodeForm returnTo={null} />);
    pendingNow.current = false;
    setState({ ...sentState, error: "Try again in a moment." });
    rerender(<EmailCodeForm returnTo={null} />);

    expect(screen.queryByText("New code sent. Check your email.")).toBeNull();
    expect(document.getElementById("code")).not.toHaveFocus();
  });

  it("moves focus to the email field after 'Use a different email'", () => {
    setState(sentState);
    render(<EmailCodeForm returnTo={null} />);
    setState({});
    fireEvent.click(
      screen.getByRole("button", { name: "Use a different email" })
    );
    expect(screen.getByLabelText("Email address")).toHaveFocus();
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
