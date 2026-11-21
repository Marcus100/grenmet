// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleSignInLink } from "./sign-in-options";

// Marks client-routed links so a test can tell them from full-page links.
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ComponentProps<"a">) => (
    <a data-next-link="" {...props}>
      {children}
    </a>
  ),
}));

describe("GoogleSignInLink", () => {
  it("is a full-page link to the Google start route", () => {
    render(<GoogleSignInLink returnTo="/continue" />);

    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link.getAttribute("href")).toContain("/google/start");
    // The start route redirects off-origin; a client fetch of it is blocked.
    expect(link.hasAttribute("data-next-link")).toBe(false);
  });
});
