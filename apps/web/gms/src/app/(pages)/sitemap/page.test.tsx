import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { NAV_SECTIONS, plannedPaths } from "@/lib/nav-sections";
import SitemapPage from "./page";

it("links every section heading to its page and marks planned pages", () => {
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
  expect(screen.getAllByText("coming soon")).toHaveLength(
    plannedPaths().length
  );
});
