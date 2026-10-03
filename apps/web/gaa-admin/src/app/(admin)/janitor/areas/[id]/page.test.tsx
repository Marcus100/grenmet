import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => queries);
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/navigation", () => navigation);
// Server env is unavailable under jsdom; labels then encode the bare code.
vi.mock("@/env", () => ({ env: {} }));

import {
  catalogue,
  managerAccess,
  viewerAccess,
} from "@/lib/janitorial/test-fixtures";
import JanitorAreaPage from "./page";

async function renderPage(id: string, access = viewerAccess) {
  queries.getJanitorialAccess.mockResolvedValue(access);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  const page = await JanitorAreaPage({ params: Promise.resolve({ id }) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      {page as ReactNode}
    </QueryClientProvider>
  );
}

describe("JanitorAreaPage", () => {
  it("shows an area's tasks, service level and QR label", async () => {
    await renderPage("10");

    expect(
      screen.getByRole("heading", { level: 1, name: "Restrooms" })
    ).toBeInTheDocument();
    expect(queries.getJanitorialCatalogue).toHaveBeenCalledWith();
    expect(screen.getByText("Clean Mirrors")).toBeInTheDocument();
    expect(screen.getByText("Retired Task")).toBeInTheDocument();
    expect(screen.getByText("Restroom")).toBeInTheDocument();
    expect(screen.getByText("Orderly spotlessness")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "QR code for GND-A0010" })
    ).toBeInTheDocument();
    expect(screen.getByText("No visits yet")).toBeInTheDocument();
  });

  it("offers editing only to catalogue managers", async () => {
    await renderPage("10");
    expect(screen.queryByRole("button", { name: "Edit area" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  });

  it("shows edit controls to catalogue managers", async () => {
    await renderPage("10", managerAccess);
    expect(
      screen.getByRole("button", { name: "Edit area" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Clean Mirrors" })
    ).toBeInTheDocument();
  });

  it("shows bundle items for areas covered by a bundle", async () => {
    await renderPage("11");

    expect(
      screen.getByText("Terrazzo Maintenance and Floor Care")
    ).toBeInTheDocument();
    expect(screen.getByText("Buff Terrazzo Floor")).toBeInTheDocument();
  });

  it.each(["999", "abc", "0"])("returns not found for id %s", async (id) => {
    let thrown: unknown;
    try {
      await renderPage(id);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("NEXT_NOT_FOUND");
  });
});
