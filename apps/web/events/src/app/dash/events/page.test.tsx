import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const { getManagedOrganiser, rememberedEvent, shell } = vi.hoisted(() => ({
  getManagedOrganiser: vi.fn(),
  rememberedEvent: vi.fn(),
  shell: vi.fn(),
}));

vi.mock("@/data/events-api", () => ({ getManagedOrganiser }));
vi.mock("@/data/event-choice", () => ({ rememberedEvent }));
vi.mock("@/data/viewer", () => ({
  requireViewer: () => Promise.resolve({ name: "Ada Byron" }),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/discovery/event-flyer", () => ({
  EventFlyer: () => null,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: (props: { children: ReactNode }) => {
    shell(props);
    return <div>{props.children}</div>;
  },
}));

import DashEventsPage from "./page";

const listing = makeManagedEvent({
  id: "evt-1",
  title: "Harbour Fete",
  admission: "ticketed",
});

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue({
    organiser: makeOrganiser({ name: "Feel Free Promotions" }),
    organisers: [],
    listings: [listing],
  });
  rememberedEvent.mockResolvedValue({
    id: "evt-1",
    ticketed: true,
    title: "Harbour Fete",
  });
});

describe("My events page", () => {
  it("marks My events as the current section and passes the remembered event", async () => {
    render(await DashEventsPage());
    expect(
      screen.getByRole("heading", { name: "My events" })
    ).toBeInTheDocument();
    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({
        active: "events",
        viewerName: "Ada Byron",
        event: { id: "evt-1", ticketed: true, title: "Harbour Fete" },
      })
    );
  });

  it("passes no event when the member has not opened one", async () => {
    rememberedEvent.mockResolvedValue(null);
    render(await DashEventsPage());
    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({ event: null })
    );
  });
});
