import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => queries);

import { catalogue, viewerAccess } from "@/lib/janitorial/test-fixtures";
import JanitorAreasPage from "./page";

const renderPage = async (
  params: Record<string, string | string[] | undefined> = {}
) => {
  queries.getJanitorialAccess.mockResolvedValue(viewerAccess);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  render(await JanitorAreasPage({ searchParams: Promise.resolve(params) }));
};

describe("JanitorAreasPage", () => {
  it("lists active areas with code, space type and APPA target", async () => {
    await renderPage();

    expect(screen.getByText("3 areas", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Restrooms" })).toHaveAttribute(
      "href",
      "/janitor/areas/10"
    );
    expect(screen.getByText("GND-A0010")).toBeInTheDocument();
    expect(screen.getByText("×6")).toBeInTheDocument();
    expect(screen.getAllByText("APPA 1").length).toBeGreaterThan(0);
    expect(
      screen.getByText("+ Terrazzo Maintenance and Floor Care")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old Kiosk" })).toBeNull();
  });

  it("filters by building and space type from the query string", async () => {
    await renderPage({ building: "3" });

    expect(screen.getByText("1 of 3 areas", { exact: false })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Whole building" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Restrooms" })).toBeNull();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/janitor/areas?site=GND"
    );
  });

  it("shows inactive areas when asked", async () => {
    await renderPage({ status: "all" });

    expect(screen.getByRole("link", { name: "Old Kiosk" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("links to printable labels for the current filter", async () => {
    await renderPage({ building: "1" });

    expect(
      screen.getByRole("link", { name: "Print QR labels" })
    ).toHaveAttribute("href", "/janitor/areas/labels?site=GND&building=1");
  });

  it("says when nothing matches", async () => {
    await renderPage({ q: "runway" });

    expect(
      screen.getByText("No areas match these filters.")
    ).toBeInTheDocument();
  });
});
