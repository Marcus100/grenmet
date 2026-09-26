import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => queries);
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

import {
  catalogue,
  managerAccess,
  noAccess,
} from "@/lib/janitorial/test-fixtures";
import JanitorPage from "./page";

const RESTROOMS = /Restrooms/;
const LAURISTON = /Lauriston/;

async function renderPage(
  params: Record<string, string> = {},
  access = managerAccess
) {
  queries.getJanitorialAccess.mockResolvedValue(access);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  render(await JanitorPage({ searchParams: Promise.resolve(params) }));
}

describe("JanitorPage (overview)", () => {
  it("summarises the active cleaning programme for MBIA by default", async () => {
    await renderPage();

    expect(queries.getJanitorialCatalogue).toHaveBeenCalledWith("GND");
    const figures = screen.getByRole("region", { name: "Programme figures" });
    // Restrooms 96/day + terrazzo 0.6/day + tower 1/day; the inactive kiosk is excluded.
    expect(within(figures).getByText("98")).toBeInTheDocument();
    expect(within(figures).getByText("3")).toBeInTheDocument();
  });

  it("switches airport with the site parameter", async () => {
    await renderPage({ site: "cru" });

    expect(queries.getJanitorialCatalogue).toHaveBeenCalledWith("CRU");
    expect(screen.getByRole("link", { name: LAURISTON })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("links each building's workload into the filtered areas register", async () => {
    await renderPage();

    expect(
      screen.getByRole("link", { name: "Air Terminal Building (ATB)" })
    ).toHaveAttribute("href", "/janitor/areas?site=GND&building=1");
    expect(screen.getByRole("link", { name: RESTROOMS })).toHaveAttribute(
      "href",
      "/janitor/areas/10"
    );
  });

  it("marks monitoring panels as waiting for field data", async () => {
    await renderPage();

    expect(screen.getByText("No check-ins yet")).toBeInTheDocument();
    expect(screen.getByText("No issues yet")).toBeInTheDocument();
    expect(screen.getByText("No inspections yet")).toBeInTheDocument();
  });

  it("is not found without janitorial access", async () => {
    let thrown: unknown;
    try {
      await renderPage({}, noAccess);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("NEXT_NOT_FOUND");
  });

  it("lets API failures reach the admin error boundary", async () => {
    queries.getJanitorialAccess.mockImplementation(() =>
      Promise.reject(new Error("unavailable"))
    );
    let thrown: unknown;
    try {
      await JanitorPage({ searchParams: Promise.resolve({}) });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("unavailable");
  });
});
