import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const { getManagedOrganiser, getOrgAttendees, shell } = vi.hoisted(() => ({
  getManagedOrganiser: vi.fn(),
  getOrgAttendees: vi.fn(),
  shell: vi.fn(),
}));

const EVENT_ID = "evt-1";
const listing = makeManagedEvent({
  admission: "ticketed",
  id: EVENT_ID,
  title: "Harbour Fete",
});

vi.mock("@/data/events-api", () => ({ getManagedOrganiser }));
vi.mock("@/data/org-context", () => ({
  resolveOrgContext: () =>
    Promise.resolve({ ok: true, accessToken: "t", organisationId: "org_1" }),
}));
vi.mock("@/data/org-orders", () => ({ getOrgAttendees }));
vi.mock("@/data/viewer", () => ({
  requireViewer: () => Promise.resolve({ name: "Ada Byron" }),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/dash/attendee-list", () => ({
  AttendeeList: () => <p>Attendee list</p>,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: (props: { children: ReactNode }) => {
    shell(props);
    return <div>{props.children}</div>;
  },
}));

import AttendeesPage from "./page";

function show() {
  return AttendeesPage({
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue({
    organiser: makeOrganiser(),
    organisers: [],
    listings: [listing],
  });
  getOrgAttendees.mockResolvedValue({
    kind: "ok",
    value: { rows: [], count: 0, page: 1, totalPages: 1 },
  });
});

describe("Attendees page", () => {
  it("marks Attendees as the current section and scopes the nav to this event", async () => {
    render(await show());
    expect(
      screen.getByRole("heading", { name: "Attendees" })
    ).toBeInTheDocument();
    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({
        active: "attendees",
        viewerName: "Ada Byron",
        event: { id: EVENT_ID, ticketed: true, title: "Harbour Fete" },
      })
    );
  });
});
