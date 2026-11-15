// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { actionState, formAction, siteKey } = vi.hoisted(() => ({
  actionState: { current: {} as Record<string, unknown> },
  formAction: vi.fn(),
  siteKey: { current: "" },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, initial: Record<string, unknown>) => [
      { ...initial, ...actionState.current },
      formAction,
      false,
    ],
  };
});
vi.mock("@/app/code/actions", () => ({ emailCodeAction: vi.fn() }));
vi.mock("@/components/code-field", () => ({
  CodeField: ({ id, label }: { id: string; label: string }) => (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} />
    </>
  ),
}));
vi.mock("@/lib/env", () => ({
  env: {
    get NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY() {
      return siteKey.current;
    },
  },
}));
// Cloudflare's widget is stubbed: a button stands in for a solved check.
vi.mock("@barrelsgd/ui/components/ui/turnstile", () => ({
  Turnstile: ({
    onToken,
    siteKey: key,
  }: {
    onToken: (token: string | null) => void;
    siteKey?: string;
  }) =>
    key ? (
      <button onClick={() => onToken(`tok-for-${key}`)} type="button">
        Solve check
      </button>
    ) : null,
}));

import { EmailCodeForm } from "./EmailCodeForm";

function sentData(): FormData {
  return formAction.mock.calls.at(-1)?.[0] as FormData;
}

describe("EmailCodeForm Turnstile", () => {
  beforeEach(() => {
    actionState.current = {};
    formAction.mockClear();
  });

  afterEach(() => {
    siteKey.current = "";
    vi.useRealTimers();
  });

  it("shows no widget and sends no token without a site key", () => {
    render(<EmailCodeForm returnTo={null} />);
    expect(screen.queryByRole("button", { name: "Solve check" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(sentData().get("turnstile_token")).toBeNull();
  });

  it("waits for the check, then sends its token with the email", () => {
    siteKey.current = "0xAUTH";
    render(<EmailCodeForm returnTo={null} />);
    const send = screen.getByRole("button", { name: "Email me a code" });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Solve check" }));
    expect(send).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(send);

    expect(sentData().get("email")).toBe("jane@example.com");
    expect(sentData().get("turnstile_token")).toBe("tok-for-0xAUTH");
  });

  it("sends a fresh token with 'Send a new code'", () => {
    vi.useFakeTimers();
    siteKey.current = "0xAUTH";
    actionState.current = {
      email: "jane@example.com",
      resendAfterSeconds: 60,
      step: "code",
    };
    render(<EmailCodeForm returnTo={null} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const resend = screen.getByRole("button", { name: "Send a new code" });
    expect(resend).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Solve check" }));
    fireEvent.click(resend);

    expect(sentData().get("email")).toBe("jane@example.com");
    expect(sentData().get("turnstile_token")).toBe("tok-for-0xAUTH");
  });

  it("does not hold the code step's sign-in button for the check", () => {
    siteKey.current = "0xAUTH";
    actionState.current = { email: "jane@example.com", step: "code" };
    render(<EmailCodeForm returnTo={null} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
