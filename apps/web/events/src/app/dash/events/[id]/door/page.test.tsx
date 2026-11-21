import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const { getManagedOrganiser, getDoorManifest, shell } = vi.hoisted(() => ({
  getManagedOrganiser: vi.fn(),
  getDoorManifest: vi.fn(),
  shell: vi.fn(),
}));

const EVENT_ID = "evt-1";
const listing = makeManagedEvent({
  admission: "ticketed",
  id: EVENT_ID,
  title: "Harbour Fete",
});

vi.mock("@/data/events-api", () => ({ getManagedOrganiser, getDoorManifest }));
vi.mock("@/data/viewer", () => ({
  requireViewer: () => Promise.resolve({ name: "Ada Byron" }),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/dash/door-console", () => ({
  DoorConsole: () => <p>Door console</p>,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: (props: { children: ReactNode }) => {
    shell(props);
    return <div>{props.children}</div>;
  },
}));

import DoorPage from "./page";

function show() {
  return DoorPage({ params: Promise.resolve({ id: EVENT_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue({
    organiser: makeOrganiser(),
    organisers: [],
    listings: [listing],
  });
  getDoorManifest.mockResolvedValue({
    id: EVENT_ID,
    title: "Harbour Fete",
    startsAt: "2999-12-27T00:30:00Z",
  });
});

describe("Door page", () => {
  it("marks Door & box office as the current section and passes the event", async () => {
    render(await show());
    expect(screen.getByRole("heading", { name: "Door" })).toBeInTheDocument();
    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({
        active: "door",
        viewerName: "Ada Byron",
        event: { id: EVENT_ID, ticketed: true, title: "Harbour Fete" },
      })
    );
  });
});
