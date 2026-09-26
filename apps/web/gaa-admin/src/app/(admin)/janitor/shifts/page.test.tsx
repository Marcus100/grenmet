import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
  getJanitorialShiftBoard: vi.fn(),
  getJanitorialStaff: vi.fn(),
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
  shiftBoard,
  staffList,
} from "@/lib/janitorial/test-fixtures";
import JanitorShiftsPage from "./page";

const CANCEL_MARIA = /^Cancel Maria Joseph/;

async function renderPage(params: Record<string, string>) {
  queries.getJanitorialAccess.mockResolvedValue(managerAccess);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  queries.getJanitorialShiftBoard.mockResolvedValue(shiftBoard);
  queries.getJanitorialStaff.mockResolvedValue(staffList);
  const page = await JanitorShiftsPage({
    searchParams: Promise.resolve(params),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      {page as ReactNode}
    </QueryClientProvider>
  );
}

describe("JanitorShiftsPage", () => {
  it("loads the requested week from Monday to Sunday", async () => {
    await renderPage({ site: "GND", week: "2026-10-07" });

    expect(queries.getJanitorialShiftBoard).toHaveBeenCalledWith(
      "GND",
      "2026-10-05",
      "2026-10-11"
    );
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute(
      "href",
      "/janitor/shifts?site=GND&week=2026-10-12"
    );
  });

  it("shows scheduled assignments in the week roster", async () => {
    await renderPage({ week: "2026-10-05" });

    expect(screen.getAllByText("Terminal restrooms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maria Joseph").length).toBeGreaterThan(0);
    // The cancelled assignment on Tuesday is not shown.
    expect(screen.getAllByRole("button", { name: CANCEL_MARIA })).toHaveLength(
      1
    );
  });
});
