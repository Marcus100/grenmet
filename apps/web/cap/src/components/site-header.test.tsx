// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("cap site header", () => {
  it("gives every main navigation link a 44px tap target", () => {
    render(<SiteHeader />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("inline-flex");
    }
  });
});
