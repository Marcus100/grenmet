// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportListingLink } from "./report-listing-link";

const LINK_NAME = "Report this listing";

describe("ReportListingLink", () => {
  it("is named Report this listing", () => {
    render(<ReportListingLink slug="sea-salt-spa" />);
    expect(screen.getByRole("link", { name: LINK_NAME })).toBeVisible();
  });

  it("mails Barrels support with the business slug as the only subject", () => {
    render(<ReportListingLink slug="sea-salt-spa" />);
    const href =
      screen.getByRole("link", { name: LINK_NAME }).getAttribute("href") ?? "";
    expect(href).toBe(
      "mailto:support@barrels.gd?subject=Report%20listing%3A%20sea-salt-spa"
    );
    const url = new URL(href);
    expect(url.searchParams.get("subject")).toBe(
      "Report listing: sea-salt-spa"
    );
    expect([...url.searchParams.keys()]).toEqual(["subject"]);
  });

  it("has a 44px tap target class", () => {
    render(<ReportListingLink slug="sea-salt-spa" />);
    expect(screen.getByRole("link", { name: LINK_NAME })).toHaveClass(
      "min-h-11"
    );
  });
});
