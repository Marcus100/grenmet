import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => queries);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  catalogue,
  managerAccess,
  viewerAccess,
} from "@/lib/janitorial/test-fixtures";
import JanitorSetupPage from "./page";

const ATB = /Air Terminal Building \(ATB\)/;

async function renderPage(access = managerAccess, site = "GND") {
  queries.getJanitorialAccess.mockResolvedValue(access);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  const page = await JanitorSetupPage({
    searchParams: Promise.resolve({ site }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      {page as ReactNode}
    </QueryClientProvider>
  );
}

describe("JanitorSetupPage", () => {
  it("lists buildings with their sections for managers", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: ATB })).toBeInTheDocument();
    expect(
      screen.getByText("Meeting Rooms & Office Spaces")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add building" })
    ).toBeInTheDocument();
  });

  it("hides adding buildings from managers limited to granted buildings", async () => {
    await renderPage({ ...managerAccess, buildingIds: [1] });

    expect(screen.queryByRole("button", { name: "Add building" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Add area" }).length).toBe(2);
  });

  it("is not found for people who cannot edit the catalogue", async () => {
    let thrown: unknown;
    try {
      await renderPage(viewerAccess);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("NEXT_NOT_FOUND");
  });
});
