// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("@barrelsgd/ui/components/posthog-provider", () => ({
  CookieSettingsButton: () => <button type="button">Cookie settings</button>,
}));

const INDEPENDENCE = /independent Barrels Grenada project/;

describe("elections SiteFooter", () => {
  it("keeps the independence line and links the Barrels support address", () => {
    render(<SiteFooter />);
    expect(screen.getByText(INDEPENDENCE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@barrels.gd" })
    ).toHaveAttribute("href", "mailto:support@barrels.gd");
  });
});
