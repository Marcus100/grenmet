import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getCurrentTimetable: vi.fn(),
  getTimetableVersions: vi.fn(),
  getTransportAccess: vi.fn(),
  getTransportCatalogue: vi.fn(),
}));
vi.mock("@/db/transport/queries", () => queries);

import {
  catalogue,
  detail,
  fullAccess,
  staffAccess,
  summary,
} from "@/components/bus/test-fixtures";
import BusPage from "./page";

const NEXT_CHANGE = /from 20 Dec 2026/;

describe("BusPage (overview)", () => {
  beforeEach(() => {
    queries.getTransportAccess.mockResolvedValue(fullAccess);
    queries.getCurrentTimetable.mockResolvedValue(detail());
    queries.getTransportCatalogue.mockResolvedValue(catalogue);
    queries.getTimetableVersions.mockResolvedValue([
      summary({ id: 3, label: "November changes", state: "draft" }),
      summary({
        id: 2,
        label: "Christmas timetable",
        state: "scheduled",
        effectiveDate: "2026-12-20",
      }),
      summary(),
    ]);
  });

  it("summarises the service and the timetable lifecycle", async () => {
    render(await BusPage());

    expect(screen.getByRole("heading", { name: "Staff bus" })).toBeVisible();
    // 1 of 2 active stops has a map location; Route 6 awaits confirmation.
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(
      screen.getByText("Trips with unconfirmed times")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "GAA staff transport memo" })
    ).toHaveAttribute("href", "/bus/timetable/1");
    expect(
      screen.getByRole("link", { name: "Christmas timetable" })
    ).toHaveAttribute("href", "/bus/timetable/2");
    expect(screen.getByText(NEXT_CHANGE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "November changes" })
    ).toBeVisible();
  });

  it("tells staff without a transport role where the timetable is", async () => {
    queries.getTransportAccess.mockResolvedValue(staffAccess);
    render(await BusPage());

    expect(screen.getByText("Bus portal access needed")).toBeInTheDocument();
    expect(queries.getTimetableVersions).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "View the timetable" })
    ).toHaveAttribute("href", "/bus/timetable");
  });

  it("lets API failures reach the admin error boundary", async () => {
    queries.getTransportAccess.mockRejectedValue(new Error("unavailable"));
    let thrown: unknown;
    try {
      await BusPage();
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("unavailable");
  });
});
