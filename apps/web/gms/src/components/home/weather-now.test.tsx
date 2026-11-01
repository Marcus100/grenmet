import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WeatherNow } from "@/components/home/weather-now";
import { fetchHomeContent, type HomeContent } from "@/lib/cms";

vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  const fetchHome = vi.fn();
  return {
    ...actual,
    fetchHomeContent: fetchHome,
    isSectionHidden: async (key: string) =>
      ((await fetchHome()) as HomeContent).settings.hiddenSections.includes(
        key
      ),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MORNING = /Morning briefing/;
const POSTED_AT_1005 = /at 10:05 a\.m\./;
const SYNOPSIS = /synopsis/i;

function home(overrides: Partial<HomeContent> = {}): HomeContent {
  const none = { status: "ok" as const, articles: [] };
  return {
    deskUpdates: none,
    stories: none,
    questions: { status: "ok", questions: [] },
    reportNotes: { status: "ok", articles: [] },
    livePosts: { status: "ok", posts: [] },
    weatherNow: null,
    discover: null,
    settings: {
      discoverCards: [],
      hiddenSections: [],
      sectionCopy: {},
      exploreReading: {},
    },
    ...overrides,
  };
}

it("uses the forecaster's current note and its alert link", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      weatherNow: {
        note: {
          text: "A flood watch is in effect for the north.",
          postedAt: "2026-09-29T14:05:00Z",
          expiresAt: "2026-09-29T16:00:00Z",
          alertUrl: "https://weather.gd/alerts/1",
        },
      },
    })
  );
  render(await WeatherNow());
  expect(
    screen.getByText("A flood watch is in effect for the north.")
  ).toBeInTheDocument();
  // Dated, in Grenada time (14:05 UTC is 10:05 a.m. AST), never a bare clock time.
  expect(screen.getByText(POSTED_AT_1005)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Read the alert" })).toHaveAttribute(
    "href",
    "https://weather.gd/alerts/1"
  );
});

it("is a blog column: no issued weather data when there is no note", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home());
  render(await WeatherNow());
  expect(
    screen.getByText("No note from the duty forecaster right now.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: SYNOPSIS })
  ).not.toBeInTheDocument();
});

it("switches the panel between tabs, each linking to its full page", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home());
  render(await WeatherNow());
  expect(screen.getByRole("tab", { name: "Satellite" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "Satellite imagery will appear here once its feed is connected."
  );
  expect(
    screen.getByRole("link", { name: "Open the full satellite page" })
  ).toHaveAttribute("href", "/weather/satellite");
  // No Radar tab until a radar feed exists (owner, 1 Nov 2026).
  expect(screen.queryByRole("tab", { name: "Radar" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Wind" }));
  expect(
    screen.getByRole("link", { name: "Open the full wind page" })
  ).toHaveAttribute("href", "/weather/conditions");
  fireEvent.click(screen.getByRole("tab", { name: "Video" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "No videos posted yet."
  );
  expect(
    screen.getByRole("link", { name: "Open the full video page" })
  ).toHaveAttribute("href", "/weather/video");
});

it("stays off the page when editors hide it", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      settings: {
        discoverCards: [],
        hiddenSections: ["weather-now"],
        sectionCopy: {},
        exploreReading: {},
      },
    })
  );
  expect(await WeatherNow()).toBeNull();
});

const post = (
  id: string,
  kind: "update" | "video" | "audio",
  title: string,
  mediaUrl: string | null = null
) => ({
  id,
  kind,
  title,
  text: null,
  mediaUrl,
  publishedAt: "2026-09-30T16:00:00Z",
  expiresAt: null,
});

it("keeps quick updates under the note and plays video in the panel on request", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      livePosts: {
        status: "ok",
        posts: [
          post("1", "update", "Showers easing in the south"),
          post("2", "video", "Midday briefing", "https://youtu.be/dQw4w9WgXcQ"),
          post(
            "3",
            "video",
            "Morning briefing",
            "https://youtu.be/abcdefghijk"
          ),
          post("4", "video", "Bad link", "https://evil.test/v"),
        ],
      },
    })
  );
  const { container } = render(await WeatherNow());
  expect(
    screen.getByRole("region", { name: "Live from GMS" })
  ).toHaveTextContent("Showers easing in the south");
  expect(container.querySelector("iframe")).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Video" }));
  expect(screen.getByRole("tab", { name: "Video" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(screen.getByTitle("Midday briefing")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
  );
  fireEvent.click(screen.getByRole("button", { name: MORNING }));
  expect(screen.getByTitle("Morning briefing")).toBeInTheDocument();
  expect(screen.queryByText("Bad link")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Audio" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "No audio posted yet."
  );
  expect(container.querySelector("iframe")).toBeNull();
});

it("shows a forecaster's note under the imagery tab it belongs to, not beside the note", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      livePosts: {
        status: "ok",
        posts: [
          {
            id: "1",
            kind: "satellite",
            title: "Cloud band moving in",
            text: "A band of cloud reaches Grenada this evening.",
            mediaUrl: null,
            publishedAt: "2026-10-28T18:30:00Z",
            expiresAt: null,
          },
          {
            id: "2",
            kind: "wind",
            title: "Gusty at the airport",
            text: "Gusts to 25 mph.",
            mediaUrl: null,
            publishedAt: "2026-10-28T18:40:00Z",
            expiresAt: null,
          },
        ],
      },
    })
  );
  render(await WeatherNow());
  // Satellite is the open tab, so its note shows and the wind note does not.
  expect(screen.getByText("Cloud band moving in")).toBeInTheDocument();
  expect(screen.queryByText("Gusty at the airport")).not.toBeInTheDocument();
  // No update post: the section still shows, with its empty state.
  expect(
    screen.getByRole("region", { name: "Live from GMS" })
  ).toHaveTextContent("No live updates from GMS right now.");
  fireEvent.click(screen.getByRole("tab", { name: "Wind" }));
  expect(screen.getByText("Gusty at the airport")).toBeInTheDocument();
  expect(screen.queryByText("Cloud band moving in")).not.toBeInTheDocument();
});

it("shows a live post's link, building a GMS address from its id", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      livePosts: {
        status: "ok",
        posts: [
          {
            id: "1",
            kind: "update",
            title: "Evening forecast is out",
            text: "Showers late tonight.",
            mediaUrl: null,
            publishedAt: "2026-10-28T18:30:00Z",
            expiresAt: null,
            relatedLinks: [
              {
                title: "Read the forecast",
                category: "forecast",
                url: "http://localhost:3003/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
                type: "product",
                ref: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
                isMain: false,
              },
            ],
          },
          {
            id: "2",
            kind: "satellite",
            title: "Cloud band moving in",
            text: "Reaches Grenada this evening.",
            mediaUrl: null,
            publishedAt: "2026-10-28T18:35:00Z",
            expiresAt: null,
            relatedLinks: [
              {
                title: "Satellite page",
                category: "article",
                url: "/weather/satellite",
                type: "page",
                ref: "/weather/satellite",
                isMain: true,
              },
            ],
          },
        ],
      },
    })
  );
  render(await WeatherNow());
  expect(
    screen.getByRole("link", { name: "Read the forecast" })
  ).toHaveAttribute(
    "href",
    "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444"
  );
  // The satellite note is under the open Satellite tab, with its own link.
  expect(screen.getByRole("link", { name: "Satellite page" })).toHaveAttribute(
    "href",
    "/weather/satellite"
  );
});

it("says when the live feed cannot be read, and keeps the section", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({ livePosts: { status: "unavailable", posts: [] } })
  );
  render(await WeatherNow());
  expect(
    screen.getByRole("region", { name: "Live from GMS" })
  ).toHaveTextContent("Live updates cannot be retrieved right now.");
});
