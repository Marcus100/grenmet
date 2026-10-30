// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("cap SiteFooter", () => {
  it("links the Barrels support address for website problems", () => {
    render(<SiteFooter />);
    expect(
      screen.getByRole("link", { name: "support@barrels.gd" })
    ).toHaveAttribute("href", "mailto:support@barrels.gd");
  });
});
