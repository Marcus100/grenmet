import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/footer";

const PATH_START = /^M/;

describe("Footer", () => {
  it("names each social network, with an icon or its name", () => {
    render(<Footer />);
    const list = screen.getByRole("list", { name: "GMS on social media" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "GMS on X",
      "GMS on Facebook",
      "GMS on Instagram",
      "GMS on YouTube",
      "GMS on LinkedIn",
      "GMS on WhatsApp",
    ]);
  });

  it("draws brand marks as hidden inline SVG, and keeps LinkedIn as text", () => {
    render(<Footer />);
    const list = screen.getByRole("list", { name: "GMS on social media" });
    const linkedin = within(list).getByRole("link", {
      name: "GMS on LinkedIn",
    });
    expect(linkedin).toHaveTextContent("LinkedIn");
    expect(linkedin.querySelector("svg")).toBeNull();
    const xLink = within(list).getByRole("link", { name: "GMS on X" });
    const svg = xLink.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("path")?.getAttribute("d")).toMatch(PATH_START);
    expect(xLink).not.toHaveTextContent("X");
  });

  it("aligns its rows to the page column like the header", () => {
    const { container } = render(<Footer />);
    // Both rows (link columns, legal line) sit in a centred max-w-6xl box.
    const rows = [...container.querySelectorAll("footer .mx-auto.max-w-6xl")];
    expect(rows).toHaveLength(2);
  });

  it("keeps the four link columns and the legal row", () => {
    render(<Footer />);
    for (const name of [
      "Weather",
      "Alerts & marine",
      "Climate & services",
      "About",
    ]) {
      expect(screen.getByRole("navigation", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
