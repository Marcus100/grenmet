import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// One no-access test per pattern: a janitor page, the janitor catalogue gate,
// and a bus page. Each renders the explanation instead of a 404.

const janitorial = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
const transport = vi.hoisted(() => ({
  getTransportAccess: vi.fn(),
  getTransportCatalogue: vi.fn(),
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);

vi.mock("@/db/janitorial/queries", () => janitorial);
vi.mock("@/db/transport/queries", () => transport);
vi.mock("next/navigation", () => ({ notFound }));

import BusStopsPage from "./bus/stops/page";
import TimetableVersionPage from "./bus/timetable/[versionId]/page";
import JanitorAreaPage from "./janitor/areas/[id]/page";
import JanitorLabelsPage from "./janitor/areas/labels/page";
import JanitorAreasPage from "./janitor/areas/page";
import JanitorPage from "./janitor/page";
import JanitorSetupPage from "./janitor/setup/page";
import JanitorShiftsPage from "./janitor/shifts/page";
import JanitorStaffPage from "./janitor/staff/page";

const NO_JANITOR_ACCESS = { canView: false, canManageCatalogue: false };
const VIEWER_NO_CATALOGUE = { canView: true, canManageCatalogue: false };
const NO_BUS_ACCESS = { canView: false, canManageCatalogue: false };

const noSearch = () => ({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("janitor pages without janitorial access", () => {
  it.each([
    ["the overview", () => JanitorPage(noSearch())],
    ["areas", () => JanitorAreasPage(noSearch())],
    ["labels", () => JanitorLabelsPage(noSearch())],
    [
      "one area",
      () => JanitorAreaPage({ params: Promise.resolve({ id: "1" }) }),
    ],
    ["shifts", () => JanitorShiftsPage(noSearch())],
    ["staff", () => JanitorStaffPage()],
  ])(
    "explains the missing role on %s instead of a 404",
    async (_name, load) => {
      janitorial.getJanitorialAccess.mockResolvedValue(NO_JANITOR_ACCESS);
      render((await load()) as ReactElement);
      expect(
        screen.getByRole("heading", { name: "Janitor access needed" })
      ).toBeInTheDocument();
      expect(notFound).not.toHaveBeenCalled();
    }
  );
});

describe("janitor setup for a viewer without catalogue rights", () => {
  it("explains the catalogue role instead of a 404", async () => {
    janitorial.getJanitorialAccess.mockResolvedValue(VIEWER_NO_CATALOGUE);
    render((await JanitorSetupPage(noSearch())) as ReactElement);
    expect(
      screen.getByRole("heading", { name: "Janitor setup access needed" })
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("bus pages without transport access", () => {
  it.each([
    ["stops", () => BusStopsPage()],
    [
      "one timetable version",
      () =>
        TimetableVersionPage({ params: Promise.resolve({ versionId: "9" }) }),
    ],
  ])(
    "explains the missing role on %s instead of a 404",
    async (_name, load) => {
      transport.getTransportAccess.mockResolvedValue(NO_BUS_ACCESS);
      transport.getTransportCatalogue.mockResolvedValue({ data: [] });
      render((await load()) as ReactElement);
      expect(
        screen.getByRole("heading", { name: "Bus access needed" })
      ).toBeInTheDocument();
      expect(notFound).not.toHaveBeenCalled();
    }
  );
});
