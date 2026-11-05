// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("SiteFooter", () => {
  it("links the Barrels support address next to the website credit", () => {
    render(<SiteFooter />);
    expect(
      screen.getByRole("link", { name: "support@barrels.gd" })
    ).toHaveAttribute("href", "mailto:support@barrels.gd");
    expect(
      screen.getByRole("link", { name: "Barrels Grenada" })
    ).toHaveAttribute("href", "https://barrels.gd/");
  });
});
