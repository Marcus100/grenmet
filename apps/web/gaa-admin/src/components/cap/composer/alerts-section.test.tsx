import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsSection } from "@/components/cap/composer/alerts-section";
import { MapSection } from "@/components/cap/composer/map-section";
import {
  type CapAlertList,
  getActiveMap,
  getLatestActiveAlerts,
  getPastAlerts,
} from "@/lib/cap-api";

vi.mock("@/lib/cap-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cap-api")>();
  return {
    ...actual,
    getActiveMap: vi.fn(),
    getLatestActiveAlerts: vi.fn(),
    getPastAlerts: vi.fn(),
  };
});
vi.mock("@/components/cap/alert-map-preview", () => ({
  AlertMapPreview: () => <div>map preview</div>,
}));

const EMPTY: CapAlertList = { count: 0, data: [] };
const NONE = "There are no active CAP alerts.";
const UNAVAILABLE = /cannot be retrieved right now/;
const FEED_OK = { status: "ok" as const, value: EMPTY };
const FEED_DOWN = { status: "unavailable" as const };
const EMPTY_MAP = {
  status: "ok" as const,
  value: { type: "FeatureCollection" as const, features: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPastAlerts).mockResolvedValue(FEED_OK);
  vi.mocked(getActiveMap).mockResolvedValue(EMPTY_MAP);
});

describe("CAP composer alerts section", () => {
  it("says there are no active alerts only when the feed answered", async () => {
    vi.mocked(getLatestActiveAlerts).mockResolvedValue(FEED_OK);
    render(await AlertsSection());
    expect(screen.getByText(NONE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a notice, not an empty list, when the feed is unreachable", async () => {
    vi.mocked(getLatestActiveAlerts).mockResolvedValue(FEED_DOWN);
    render(await AlertsSection());
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(UNAVAILABLE);
    expect(notice).toHaveTextContent(
      "This does not mean there are no active CAP alerts."
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});

describe("CAP composer map section", () => {
  it("shows the map and an empty list when the feeds answered with nothing", async () => {
    vi.mocked(getLatestActiveAlerts).mockResolvedValue(FEED_OK);
    render(await MapSection());
    expect(screen.getByText("map preview")).toBeInTheDocument();
    expect(
      screen.getByText("There are no active map alerts.")
    ).toBeInTheDocument();
  });

  it("shows notices, not an empty map or list, when the feeds are unreachable", async () => {
    vi.mocked(getLatestActiveAlerts).mockResolvedValue(FEED_DOWN);
    vi.mocked(getActiveMap).mockResolvedValue(FEED_DOWN);
    render(await MapSection());
    expect(screen.queryByText("map preview")).not.toBeInTheDocument();
    expect(
      screen.queryByText("There are no active map alerts.")
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
  });
});
