import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WeatherNow } from "@/components/home/weather-now";
import { fetchHomeContent, type HomeContent } from "@/lib/cms";

vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  const fetchHome = vi.fn();
  return {
    ...actual,
    fetchHomeContent: fetchHome,
    isSectionHidden: async () => false,
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function home(note: Record<string, unknown> | null): HomeContent {
  const none = { status: "ok" as const, articles: [] };
  return {
    deskUpdates: none,
    stories: none,
    questions: { status: "ok", questions: [] },
    reportNotes: none,
    livePosts: { status: "ok", posts: [] },
    weatherNow: note ? ({ note } as HomeContent["weatherNow"]) : null,
    discover: null,
    settings: {
      discoverCards: [],
      hiddenSections: [],
      sectionCopy: {},
      exploreReading: {},
    },
  };
}

const base = {
  text: "A flood watch is in effect for the north.",
  postedAt: "2026-10-29T14:05:00Z",
  expiresAt: "2026-10-29T16:00:00Z",
};

it("shows the note's CAP alert as a card, named by the warning", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      ...base,
      alertUrl: "https://weather.barrels.gd/alerts/GMS-1",
      relatedLinks: [
        {
          title: "Heavy rain for St. George",
          category: "cap",
          url: "https://weather.barrels.gd/alerts/GMS-1",
          type: "cap",
          ref: "GMS-1",
          isMain: true,
        },
      ],
    })
  );
  render(await WeatherNow());
  expect(
    screen.getByRole("link", { name: "Heavy rain for St. George" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Read the alert" })
  ).not.toBeInTheDocument();
});

it("keeps the plain alert link for a feed that has no related links", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({ ...base, alertUrl: "https://weather.gd/alerts/1" })
  );
  render(await WeatherNow());
  expect(screen.getByRole("link", { name: "Read the alert" })).toHaveAttribute(
    "href",
    "https://weather.gd/alerts/1"
  );
});

it("shows the main related link, not the first, when a note has several", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      ...base,
      alertUrl: null,
      relatedLinks: [
        {
          title: "Outside report",
          category: "source",
          url: "https://example.test/report",
          type: "link",
          ref: null,
          isMain: false,
        },
        {
          title: "Evening Forecast",
          category: "forecast",
          url: "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
          type: "product",
          ref: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
          isMain: true,
        },
      ],
    })
  );
  render(await WeatherNow());
  expect(
    screen.getByRole("link", { name: "Evening Forecast" })
  ).toHaveAttribute(
    "href",
    "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444"
  );
  expect(
    screen.queryByRole("link", { name: "Outside report" })
  ).not.toBeInTheDocument();
});

it("says no note is posted when the feed has none", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home(null));
  render(await WeatherNow());
  expect(
    screen.getByText("No note from the duty forecaster right now.")
  ).toBeInTheDocument();
});
