import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ listFeeds: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/desk/feeds/actions", () => ({
  createFeed: vi.fn(),
  deleteFeed: vi.fn(),
  updateFeed: vi.fn(),
}));

import Loading from "./loading";
import FeedsPage from "./page";

const LAST_ERROR = /Connection refused/;

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
});

describe("/desk/feeds", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading feed sources"
    );
  });

  it("shows no access without cap.feed.manage and does not read the feeds", async () => {
    gate.requireDeskGate.mockResolvedValue(staffGate({ feedsManage: false }));
    render(await FeedsPage());
    expect(
      screen.getByRole("heading", { name: "No access to feed sources" })
    ).toBeInTheDocument();
    expect(api.listFeeds).not.toHaveBeenCalled();
  });

  it("shows unavailable and reports an unexpected read failure", async () => {
    const boom = new Error("down");
    api.listFeeds.mockRejectedValue(boom);
    render(await FeedsPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Feed sources could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-feeds");
  });

  it("shows the empty state with the add form", async () => {
    api.listFeeds.mockResolvedValue([]);
    render(await FeedsPage());
    expect(screen.getByText("No feed sources configured.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add a feed source" })
    ).toBeInTheDocument();
  });

  it("lists each saved feed source", async () => {
    api.listFeeds.mockResolvedValue([
      {
        created_at: "2026-10-01T00:00:00Z",
        id: "11111111-2222-4333-8444-555555555555",
        last_checked_at: "2026-10-30T10:00:00Z",
        last_error: "Connection refused",
        name: "Partner feed",
        status: "ACTIVE",
        updated_at: "2026-10-01T00:00:00Z",
        url: "https://partner.example.test/cap.xml",
      },
    ]);
    render(await FeedsPage());
    expect(
      screen.getByRole("heading", { name: "Partner feed" })
    ).toBeInTheDocument();
    expect(screen.getByText(LAST_ERROR)).toBeInTheDocument();
  });
});
