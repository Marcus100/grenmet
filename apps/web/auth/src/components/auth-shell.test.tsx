// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShell } from "./auth-shell";

describe("AuthShell", () => {
  it("renders the Barrels mark, the page content and the support address", () => {
    render(
      <AuthShell>
        <p>Form goes here</p>
      </AuthShell>
    );
    expect(screen.getByRole("link", { name: "Barrels" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByText("Form goes here")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@barrels.gd" })
    ).toHaveAttribute("href", "mailto:support@barrels.gd");
  });

  it("never lists other organisations' apps to a signed-out visitor", () => {
    render(
      <AuthShell>
        <p>Form</p>
      </AuthShell>
    );
    expect(
      screen.queryByRole("navigation", { name: "Apps" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-panel")).toBeNull();
    expect(screen.queryByText("Staff console (superusers only)")).toBeNull();
  });

  it("shows the sidebar only when a signed-in page passes one", () => {
    render(
      <AuthShell sidebar={<nav aria-label="Apps">Your apps</nav>}>
        <p>Account</p>
      </AuthShell>
    );
    expect(
      screen.getByRole("navigation", { name: "Apps" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-panel")).toBeInTheDocument();
  });

  it("makes the main landmark the skip-link target", () => {
    render(
      <AuthShell>
        <p>Form</p>
      </AuthShell>
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});
