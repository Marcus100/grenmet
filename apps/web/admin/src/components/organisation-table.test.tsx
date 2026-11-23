import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganisationTable } from "@/components/organisation-table";

const rows = [
  {
    id: "gaa",
    slug: "gaa",
    name: "Grenada Airports Authority",
    kind: "client",
    status: "active",
    active_member_count: 12,
    verified_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "org_0123456789abcdef",
    slug: "spice-isle-tours",
    name: "Spice Isle Tours",
    kind: "business",
    status: "suspended",
    active_member_count: 0,
    verified_at: null,
  },
];

describe("OrganisationTable", () => {
  it("lists each organisation with link, status, members and verification", () => {
    render(<OrganisationTable rows={rows} />);
    const [, first, second] = screen.getAllByRole("row");

    expect(
      within(first as HTMLElement)
        .getByRole("link", { name: "Grenada Airports Authority" })
        .getAttribute("href")
    ).toBe("/organisations/gaa");
    expect(within(first as HTMLElement).getByText("Active")).toBeTruthy();
    expect(within(first as HTMLElement).getByText("12")).toBeTruthy();
    expect(within(first as HTMLElement).getByText("Verified")).toBeTruthy();

    expect(
      within(second as HTMLElement)
        .getByRole("link", { name: "Spice Isle Tours" })
        .getAttribute("href")
    ).toBe("/organisations/org_0123456789abcdef");
    expect(within(second as HTMLElement).getByText("Suspended")).toBeTruthy();
    expect(
      within(second as HTMLElement).getByText("Not verified")
    ).toBeTruthy();
  });

  it("explains a filtered empty list and offers clear filters and a new organisation", () => {
    render(<OrganisationTable filtered rows={[]} />);
    expect(screen.getByRole("status").textContent).toContain(
      "No organisations match"
    );
    expect(
      screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")
    ).toBe("/organisations");
    expect(
      screen
        .getByRole("link", { name: "New organisation" })
        .getAttribute("href")
    ).toBe("/organisations/new");
  });

  it("explains an empty platform without offering to clear anything", () => {
    render(<OrganisationTable rows={[]} />);
    expect(screen.getByText("No organisations yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    expect(screen.getByRole("link", { name: "New organisation" })).toBeTruthy();
  });
});
