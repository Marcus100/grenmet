import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const { getManagedOrganiser, getSettlement, shell } = vi.hoisted(() => ({
  getManagedOrganiser: vi.fn(),
  getSettlement: vi.fn(),
  shell: vi.fn(),
}));

const EVENT_ID = "evt-1";
const listing = makeManagedEvent({
  admission: "ticketed",
  id: EVENT_ID,
  title: "Harbour Fete",
});

vi.mock("@/data/events-api", () => ({ getManagedOrganiser, getSettlement }));
vi.mock("@/data/viewer", () => ({
  requireViewer: () => Promise.resolve({ name: "Ada Byron" }),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/dash/settlement-report", () => ({
  SettlementReport: () => <p>Settlement report</p>,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: (props: { children: ReactNode }) => {
    shell(props);
    return <div>{props.children}</div>;
  },
}));

import SettlementPage from "./page";

function show() {
  return SettlementPage({ params: Promise.resolve({ id: EVENT_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue({
    organiser: makeOrganiser(),
    organisers: [],
    listings: [listing],
  });
  getSettlement.mockResolvedValue({
    title: "Harbour Fete",
    startsAt: "2999-12-27T00:30:00Z",
  });
});

describe("Settlement page", () => {
  it("marks Finance as the current section and scopes the nav to this event", async () => {
    render(await show());
    expect(
      screen.getByRole("heading", { name: "Settlement" })
    ).toBeInTheDocument();
    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({
        active: "finance",
        viewerName: "Ada Byron",
        event: { id: EVENT_ID, ticketed: true, title: "Harbour Fete" },
      })
    );
  });
});
