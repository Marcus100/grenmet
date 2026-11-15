// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InviteBody } from "./invite-form";

const TOKEN = "t".repeat(40);
const noop = vi.fn();

function body(overrides: Partial<Parameters<typeof InviteBody>[0]> = {}) {
  return (
    <InviteBody
      action={noop}
      error={null}
      needsTotp={false}
      pending={false}
      step="send"
      token={TOKEN}
      {...overrides}
    />
  );
}

const STEP_THREE = /Step 3 of 3 is on the same page/u;

describe("superuser invitation steps", () => {
  it("first asks for the emailed code and never shows a code field", () => {
    render(body());
    expect(
      screen.getByRole("button", { name: "Email me a code" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });

  it("then takes the six-digit code and offers a new one", () => {
    render(body({ step: "code" }));
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept invitation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a new code" })
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Authenticator code")
    ).not.toBeInTheDocument();
  });

  it("asks for the authenticator code too when the account has one", () => {
    render(body({ step: "code", needsTotp: true }));
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
  });

  it("ends by linking to the Security page to set up the authenticator", () => {
    render(body({ step: "done" }));
    const link = screen.getByRole("link", {
      name: "Set up your authenticator",
    });
    expect(link).toHaveAttribute("href", "/security");
    expect(screen.getByText(STEP_THREE)).toBeInTheDocument();
  });

  it("shows an error as an alert on the step it belongs to", () => {
    render(body({ step: "code", error: "That code didn't work." }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That code didn't work."
    );
  });

  it("disables the submit while the request is in flight", () => {
    render(body({ pending: true }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });
});
