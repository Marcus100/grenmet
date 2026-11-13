import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { isComing, NAV_SECTIONS, sectionLinks } from "@/lib/nav-sections";
import SitemapPage from "./page";

it("links every section heading to its page and marks coming pages", () => {
  render(<SitemapPage />);
  for (const section of NAV_SECTIONS) {
    const heading = screen.getByRole("heading", {
      level: 2,
      name: section.label,
    });
    expect(within(heading).getByRole("link")).toHaveAttribute(
      "href",
      section.href
    );
  }
  const coming = NAV_SECTIONS.flatMap((section) =>
    sectionLinks(section).filter(isComing)
  );
  expect(screen.getAllByText("Coming")).toHaveLength(coming.length);
});
