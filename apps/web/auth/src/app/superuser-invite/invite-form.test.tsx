// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { InviteBody, SuperuserInviteForm } from "./invite-form";

vi.mock("./actions", () => ({ superuserInviteAction: vi.fn() }));

const TOKEN = "AbC_123-".repeat(6);
const STEP_THREE = /Step 3 of 3 is on the same page/u;
const NEEDS_LINK = /This page needs the link from your invitation email/u;
const noop = vi.fn();

function body(overrides: Partial<Parameters<typeof InviteBody>[0]> = {}) {
  return (
    <InviteBody
      action={noop}
      error={null}
      needsTotp={false}
      notice={null}
      pending={false}
      step="send"
      token={TOKEN}
      {...overrides}
    />
  );
}

describe("SuperuserInviteForm: reading the link", () => {
  it("keeps the token in the form under Strict Mode and removes the fragment", async () => {
    window.history.replaceState(null, "", `/superuser-invite#token=${TOKEN}`);
    render(
      <StrictMode>
        <SuperuserInviteForm />
      </StrictMode>
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="token"]')?.value
      ).toBe(TOKEN)
    );
    expect(window.location.hash).toBe("");
  });

  it("says how to open the link when the fragment has no token", async () => {
    window.history.replaceState(null, "", "/superuser-invite");
    render(
      <StrictMode>
        <SuperuserInviteForm />
      </StrictMode>
    );
    expect(await screen.findByText(NEEDS_LINK)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("superuser invitation steps", () => {
  it("first asks for the emailed code and never shows a code field", () => {
    render(body());
    expect(
      screen.getByRole("button", { name: "Email me a code" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });

  it("then takes the six-digit code and offers a new one", () => {
    render(
      body({
        step: "code",
        notice: "A new code was sent, if the invitation is still open.",
      })
    );
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept invitation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a new code" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "A new code was sent, if the invitation is still open."
    );
    expect(
      screen.queryByLabelText("Authenticator code")
    ).not.toBeInTheDocument();
  });

  it("offers a recovery code in the authenticator field", () => {
    render(body({ step: "code", needsTotp: true }));
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use a recovery code instead" })
    ).toBeInTheDocument();
  });

  it("ends by linking to the Security page to set up the authenticator", () => {
    render(body({ step: "done" }));
    const link = screen.getByRole("link", {
      name: "Set up your authenticator",
    });
    expect(link).toHaveAttribute("href", "/security");
    expect(screen.getByText(STEP_THREE)).toBeInTheDocument();
  });

  it("shows an error as an alert and moves focus to it", () => {
    render(body({ step: "code", error: "That code didn't work." }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That code didn't work.");
    expect(alert).toHaveFocus();
  });

  it("moves focus to the step heading when the step changes", () => {
    const { rerender } = render(body({ step: "code" }));
    rerender(body({ step: "done" }));
    expect(
      screen.getByRole("heading", { name: "You are an administrator" })
    ).toHaveFocus();
  });

  it("disables the submit while the request is in flight", () => {
    render(body({ pending: true }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });
});
