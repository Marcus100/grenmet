import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";

const { getManagedOrganiser, getListingActivity, requireViewer } = vi.hoisted(
  () => ({
    getManagedOrganiser: vi.fn(),
    getListingActivity: vi.fn(),
    requireViewer: vi.fn(),
  })
);

vi.mock("@/data/events-api", () => ({
  getListingActivity,
  getManagedOrganiser,
}));
vi.mock("@/data/viewer", () => ({ requireViewer }));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No organiser access</p>,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/dash/event-editor", () => ({ EventEditor: () => null }));
vi.mock("@/components/dash/event-lifecycle", () => ({
  EventLifecycle: () => null,
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));

import EditEventPage from "./page";

const event = makeManagedEvent({
  startsAt: "2999-12-27T00:30:00Z",
  endsAt: "2999-12-27T02:00:00Z",
  title: "Synthetic harbour show",
});
const workspace = {
  organiser: makeOrganiser(),
  organisers: [],
  listings: [event],
};
const heading = { name: "WhatsApp announcement" };

function show(pilot?: string | string[]) {
  return EditEventPage({
    params: Promise.resolve({ id: event.id }),
    searchParams: Promise.resolve({ pilot }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue(workspace);
  getListingActivity.mockResolvedValue([]);
});

describe("event editor WhatsApp preview", () => {
  it("keeps the pilot out of the standard editor", async () => {
    render(await show());
    expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
  });

  it("shows a draft for the selected organiser's eligible event by explicit opt-in", async () => {
    render(await show("whatsapp"));
    expect(requireViewer).toHaveBeenCalledExactlyOnceWith(
      `/dash/events/${event.id}?pilot=whatsapp`
    );
    expect(screen.getByRole("heading", heading)).toBeInTheDocument();
    const preview = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Draft preview",
    });
    expect(preview.value).toContain(event.title);
  });

  it("retains the pilot in the return path when sign-in is required", async () => {
    requireViewer.mockRejectedValueOnce(new Error("Sign-in required"));
    await expect(show("whatsapp")).rejects.toThrow("Sign-in required");
    expect(requireViewer).toHaveBeenCalledExactlyOnceWith(
      `/dash/events/${event.id}?pilot=whatsapp`
    );
    expect(getManagedOrganiser).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous pilot parameter", async () => {
    render(await show(["whatsapp", "whatsapp"]));
    expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
  });

  it("keeps a private listing out of the pilot even if it is published", async () => {
    getManagedOrganiser.mockResolvedValue({
      ...workspace,
      listings: [{ ...event, accessType: "private" }],
    });
    render(await show("whatsapp"));
    expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
  });

  it("cannot render a draft for a listing outside the selected organiser's workspace", async () => {
    getManagedOrganiser.mockResolvedValue({ ...workspace, listings: [] });
    await expect(show("whatsapp")).rejects.toThrow("Not found");
    expect(getListingActivity).not.toHaveBeenCalled();
  });
});
