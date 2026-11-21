import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const {
  getManagedOrganiser,
  getSettlementSummaries,
  rememberedEvent,
  overview,
} = vi.hoisted(() => ({
  getManagedOrganiser: vi.fn(),
  getSettlementSummaries: vi.fn(),
  rememberedEvent: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("@/data/events-api", () => ({
  getManagedOrganiser,
  getSettlementSummaries,
}));
vi.mock("@/data/event-choice", () => ({ rememberedEvent }));
vi.mock("@/data/viewer", () => ({
  requireViewer: () => Promise.resolve({ name: "Ada Byron" }),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/dash/organiser-verification-notice", () => ({
  OrganiserVerificationNotice: () => null,
}));
vi.mock("@/components/dash/organiser-overview", () => ({
  OrganiserOverview: (props: unknown) => {
    overview(props);
    return <p>overview</p>;
  },
}));

import DashOverviewPage from "./page";

const listing = makeManagedEvent({ id: "evt-1", title: "Harbour Fete" });

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue({
    organiser: makeOrganiser({ verified: true }),
    organisers: [],
    listings: [listing],
  });
  getSettlementSummaries.mockResolvedValue([]);
  rememberedEvent.mockResolvedValue({
    id: "evt-1",
    ticketed: false,
    title: "Harbour Fete",
  });
});

describe("Organiser overview page", () => {
  it("passes the viewer's name and the remembered event to the overview", async () => {
    render(await DashOverviewPage());
    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(rememberedEvent).toHaveBeenCalledWith([listing]);
    expect(overview).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerName: "Ada Byron",
        event: { id: "evt-1", ticketed: false, title: "Harbour Fete" },
      })
    );
  });

  it("passes no event when nothing is remembered", async () => {
    rememberedEvent.mockResolvedValue(null);
    render(await DashOverviewPage());
    expect(overview).toHaveBeenCalledWith(
      expect.objectContaining({ event: null })
    );
  });
});
