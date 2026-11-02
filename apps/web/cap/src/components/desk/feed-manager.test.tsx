import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({
  createFeed: vi.fn(),
  deleteFeed: vi.fn(),
  updateFeed: vi.fn(),
}));
vi.mock("@/app/desk/feeds/actions", () => actions);

import type { CapFeedImportPublic } from "@barrelsgd/api-client";
import { FeedManager } from "./feed-manager";

const FEED: CapFeedImportPublic = {
  created_at: "2026-10-01T00:00:00Z",
  id: "11111111-2222-4333-8444-555555555555",
  last_checked_at: null,
  last_error: null,
  name: "Partner feed",
  status: "ACTIVE",
  updated_at: "2026-10-01T00:00:00Z",
  url: "https://partner.example.test/cap.xml",
};

const SAVE_FEED = /save feed/i;
const DELETE_BUTTON = /delete feed/i;
const CONFIRM_DELETE = "Delete feed";
const NO_FEEDS = "No feed sources configured.";
const NOT_CHECKED = /Not yet reported/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedManager", () => {
  it("says plainly when no feed is configured", () => {
    render(<FeedManager feeds={[]} />);
    expect(screen.getByText(NO_FEEDS)).toBeInTheDocument();
  });

  it("shows an unchecked feed as not yet reported, not as healthy", () => {
    render(<FeedManager feeds={[FEED]} />);
    expect(screen.getByText(NOT_CHECKED)).toBeInTheDocument();
  });

  it("asks before deleting and keeps the feed when the user declines", () => {
    render(<FeedManager feeds={[FEED]} />);
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON }));
    expect(
      screen.getByRole("heading", { name: "Delete Partner feed?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep feed" }));
    expect(actions.deleteFeed).not.toHaveBeenCalled();
  });

  it("deletes after confirmation and refreshes the list", async () => {
    actions.deleteFeed.mockResolvedValue({ data: null, ok: true });
    render(<FeedManager feeds={[FEED]} />);
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: CONFIRM_DELETE }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.deleteFeed).toHaveBeenCalledWith(FEED.id);
  });

  it("shows the error and keeps the feed when a save is refused", async () => {
    actions.updateFeed.mockResolvedValue({
      error: {
        items: [],
        kind: "not-allowed",
        status: 403,
        title: "You do not have permission for this action.",
      },
      ok: false,
    });
    render(<FeedManager feeds={[FEED]} />);
    fireEvent.click(screen.getByRole("button", { name: SAVE_FEED }));
    expect(
      await screen.findByText("You do not have permission for this action.")
    ).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(FEED.name)).toBeInTheDocument();
  });
});
