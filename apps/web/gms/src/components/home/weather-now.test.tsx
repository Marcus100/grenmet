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

function home(overrides: Partial<HomeContent> = {}): HomeContent {
  const none = { status: "ok" as const, articles: [] };
  return {
    deskUpdates: none,
    stories: none,
    questions: { status: "ok", questions: [] },
    weatherNow: null,
    discover: null,
    settings: { discoverCards: [], hiddenSections: [] },
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
  render(await WeatherNow({ forecasterNote: "Issued summary" }));
  expect(
    screen.getByText("A flood watch is in effect for the north.")
  ).toBeInTheDocument();
  expect(screen.queryByText("Issued summary")).not.toBeInTheDocument();
  expect(screen.getByText("· 10:05", { exact: false })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Read the alert" })).toHaveAttribute(
    "href",
    "https://weather.gd/alerts/1"
  );
  expect(screen.getByRole("link", { name: "Satellite" })).toHaveAttribute(
    "href",
    "/weather/satellite"
  );
});

it("falls back to the issued summary", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home());
  render(await WeatherNow({ forecasterNote: "Issued summary" }));
  expect(screen.getByText("Issued summary")).toBeInTheDocument();
  expect(screen.getByText("Interactive map coming soon")).toBeInTheDocument();
});

it("stays off the page when editors hide it", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({ settings: { discoverCards: [], hiddenSections: ["weather-now"] } })
  );
  expect(await WeatherNow({ forecasterNote: "x" })).toBeNull();
});
