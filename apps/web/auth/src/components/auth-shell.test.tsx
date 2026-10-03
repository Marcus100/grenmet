// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthShell } from "./auth-shell";

vi.mock("@barrelsgd/gms/components/logo", () => ({
  Logo: () => <span>GMS logo</span>,
}));

describe("AuthShell", () => {
  it("renders the greeting, app list and page content", () => {
    render(
      <AuthShell greeting="Hello again" subtitle="Sign in to continue.">
        <p>Form goes here</p>
      </AuthShell>
    );
    expect(screen.getByText("Hello again")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Apps" })
    ).toBeInTheDocument();
    expect(screen.getByText("Form goes here")).toBeInTheDocument();
  });

  it("puts the brand panel on the right when asked", () => {
    const { container } = render(
      <AuthShell greeting="Welcome" side="right" subtitle="Hi">
        <p>Form</p>
      </AuthShell>
    );
    expect(container.firstElementChild).toHaveClass("lg:flex-row-reverse");
  });
});
