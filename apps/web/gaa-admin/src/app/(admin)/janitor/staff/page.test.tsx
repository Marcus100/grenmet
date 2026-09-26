import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
  getJanitorialGrants: vi.fn(),
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
  grants,
  managerAccess,
  staffList,
  viewerAccess,
} from "@/lib/janitorial/test-fixtures";
import JanitorStaffPage from "./page";

async function renderPage(access = managerAccess) {
  queries.getJanitorialAccess.mockResolvedValue(access);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  queries.getJanitorialGrants.mockResolvedValue(grants);
  queries.getJanitorialStaff.mockResolvedValue(staffList);
  const page = await JanitorStaffPage();
  render(
    <QueryClientProvider client={new QueryClient()}>
      {page as ReactNode}
    </QueryClientProvider>
  );
}

describe("JanitorStaffPage", () => {
  it("shows the contractor, staff and building access to managers", async () => {
    await renderPage();

    expect(screen.getAllByText("CleanCo Ltd").length).toBeGreaterThan(0);
    expect(screen.getByText("Maria Joseph")).toBeInTheDocument();
    expect(screen.getByText("Login disabled")).toBeInTheDocument();
    expect(screen.getByText("Sam Supervisor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Control Tower from Sam Supervisor",
      })
    ).toBeInTheDocument();
  });

  it("is read-only and skips grants for viewers", async () => {
    await renderPage(viewerAccess);

    expect(queries.getJanitorialGrants).not.toHaveBeenCalled();
    expect(screen.queryByText("Building access")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add staff member" })
    ).toBeNull();
  });
});
