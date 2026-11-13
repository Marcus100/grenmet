// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ saveNameAction: vi.fn() }));

import { NamePrompt, VerifyBanner } from "./account-notices";

describe("account notices", () => {
  it("links the banner to the confirmation form without blocking the page", () => {
    render(<VerifyBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirm your email address"
    );
    expect(
      screen.getByRole("link", { name: "Send a confirmation link" })
    ).toHaveAttribute("href", "/verify-email");
  });

  it("asks for names as optional, with autofill attributes", () => {
    render(<NamePrompt />);
    expect(screen.getByText("Add your name (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveAttribute(
      "autocomplete",
      "given-name"
    );
    expect(screen.getByLabelText("Last name")).toHaveAttribute(
      "autocomplete",
      "family-name"
    );
  });

  it("disables the name submit before hydration", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToString(<NamePrompt />);
    const button = holder.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    expect(button?.disabled).toBe(true);
  });
});
