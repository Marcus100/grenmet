import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/footer";

describe("Footer", () => {
  it("names each social network in text, not in typed letters", () => {
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
