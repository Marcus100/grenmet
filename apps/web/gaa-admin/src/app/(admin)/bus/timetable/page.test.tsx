import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getCurrentTimetable: vi.fn(),
  getTimetableVersions: vi.fn(),
  getTransportAccess: vi.fn(),
  getTransportCatalogue: vi.fn(),
}));
vi.mock("@/db/transport/queries", () => queries);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  catalogue,
  detail,
  fullAccess,
  staffAccess,
  summary,
  viewerAccess,
} from "@/components/bus/test-fixtures";
import BusTimetablePage from "./page";

const IN_FORCE_SUMMARY = /in force since 25 Sep 2026 · 2 trips/;

function renderPage(page: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>{page}</QueryClientProvider>
  );
}

describe("BusTimetablePage", () => {
  beforeEach(() => {
    queries.getTransportAccess.mockResolvedValue(fullAccess);
    queries.getCurrentTimetable.mockResolvedValue(detail());
    queries.getTransportCatalogue.mockResolvedValue(catalogue);
    queries.getTimetableVersions.mockResolvedValue([summary()]);
  });

  it("shows the timetable in force grouped by route and shift", async () => {
    renderPage(await BusTimetablePage());

    expect(
      screen.getByRole("heading", {
        name: "Route 6 — Mardigras and Surrounding Areas",
      })
    ).toBeVisible();
    expect(screen.getAllByText("Morning shift · 5:30 AM–2:00 PM")).toHaveLength(
      2
    );
    expect(screen.getByText("Awaiting confirmation")).toBeInTheDocument();
    // Group times are approximate until confirmed.
    expect(screen.getByText("≈ 3:30 AM")).toBeInTheDocument();
    expect(screen.getByText(IN_FORCE_SUMMARY)).toBeVisible();
  });

  it("offers to start a draft, or to continue the one in progress", async () => {
    renderPage(await BusTimetablePage());
    expect(screen.getByRole("button", { name: "Start a draft" })).toBeVisible();

    queries.getTimetableVersions.mockResolvedValue([
      summary({ id: 7, label: "Draft", state: "draft", status: "draft" }),
      summary(),
    ]);
    renderPage(await BusTimetablePage());
    expect(
      screen.getByRole("link", { name: "Continue draft" })
    ).toHaveAttribute("href", "/bus/timetable/7");
  });

  it("lists versions and routes read-only for viewers", async () => {
    queries.getTransportAccess.mockResolvedValue(viewerAccess);
    renderPage(await BusTimetablePage());

    const versions = screen.getByRole("region", { name: "Versions" });
    expect(within(versions).getByText("In force")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Routes" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start a draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add route" })).toBeNull();
  });

  it("shows plain staff the full timetable without portal controls", async () => {
    queries.getTransportAccess.mockResolvedValue(staffAccess);
    renderPage(await BusTimetablePage());

    expect(queries.getTimetableVersions).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "Route 1 — St. Patrick (Western Main Road)",
      })
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "Versions" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Routes" })).toBeNull();
  });

  it("explains when nothing has been published", async () => {
    queries.getCurrentTimetable.mockResolvedValue(null);
    renderPage(await BusTimetablePage());
    expect(screen.getByText("Nothing published yet")).toBeInTheDocument();
  });
});
