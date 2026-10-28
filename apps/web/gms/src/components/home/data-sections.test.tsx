import type { PublicMonthSummary } from "@barrelsgd/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExploreToday, GrenadaInData } from "@/components/home/data-sections";
import { fetchHomeContent, type HomeContent } from "@/lib/cms";
import { fetchMonthSummary } from "@/lib/products";

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
vi.mock("@/lib/products", () => ({ fetchMonthSummary: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RAIN_UNIT = "mm";
const SUMMARY: PublicMonthSummary = {
  station_id: "78958",
  station_name: "MBIA",
  month: "2026-10",
  period_start: "2026-10-01T00:00:00Z",
  period_end: "2026-10-18T15:00:00Z",
  last_observation_at: "2026-10-18T12:00:00Z",
  observation_count: 6,
  days_elapsed: 18,
  rain_report_days: 4,
  rainfall_mm: 12.3,
  rain_days: 2,
  rain_day_threshold_mm: 0.2,
  max_temperature_c: 32.6,
  max_temperature_at: "2026-10-05T12:00:00Z",
  min_temperature_c: 23.9,
  min_temperature_at: "2026-10-01T12:00:00Z",
  provisional: true,
};

const RIP_LINK = /Tourism & outdoors:.*Read: What is a rip current\?/;
const READ_MORE = /^Read:/;
const OLD_READING = /90 minutes/;

const home = (settings: Partial<HomeContent["settings"]>): HomeContent => ({
  deskUpdates: { status: "ok", articles: [] },
  stories: { status: "ok", articles: [] },
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
    ...settings,
  },
});

it("hangs a published explainer off its service", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      exploreReading: {
        beach: {
          collection: "questions",
          title: "What is a rip current?",
          slug: "questions/what-is-a-rip-current",
        },
      },
    })
  );
  render(await ExploreToday());
  expect(screen.getByRole("link", { name: RIP_LINK })).toHaveAttribute(
    "href",
    "/explore/explained/what-is-a-rip-current"
  );
  expect(screen.queryAllByText(READ_MORE)).toHaveLength(1);
});

it("links each sector and states that no impact outlook is published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  render(await ExploreToday());
  for (const [sector, href] of [
    ["Tourism & outdoors", "/services/tourism"],
    ["Marine", "/marine"],
    ["Aviation", "/services/aviation"],
    ["Agriculture", "/services/agriculture"],
    ["Health", "/services/health"],
    ["Roads & transport", "/services/roads-transport"],
  ] as const) {
    expect(screen.getByText(sector).closest("a")).toHaveAttribute("href", href);
  }
  expect(screen.getAllByText("Impact outlook not yet published")).toHaveLength(
    6
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("uses the editors' wording and keeps the standard wording when blank", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      sectionCopy: {
        "explore-today": { title: "Your day outside", intro: "Plan ahead." },
      },
    })
  );
  render(await ExploreToday());
  expect(
    screen.getByRole("heading", { name: "Your day outside" })
  ).toBeInTheDocument();
  expect(screen.getByText("Plan your week")).toBeInTheDocument();
  expect(screen.getByText("Plan ahead.")).toBeInTheDocument();
});

it("shows the live month summary with its provisional label", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchMonthSummary).mockResolvedValue({
    ...SUMMARY,
    last_observation_at: new Date().toISOString(),
  });
  render(await GrenadaInData());
  expect(screen.getByText("12.3")).toBeInTheDocument();
  expect(screen.getByText("32.6")).toBeInTheDocument();
  expect(
    screen.getByText("Month to date · MBIA · provisional · to 18 October")
  ).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("never calls a month summary an old reading", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchMonthSummary).mockResolvedValue({ ...SUMMARY });
  render(await GrenadaInData());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(OLD_READING)).not.toBeInTheDocument();
});

it("shows an unavailable state instead of figures when the summary is missing", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchMonthSummary).mockResolvedValue(null);
  render(await GrenadaInData());
  expect(screen.getByRole("status")).toHaveTextContent("not available");
  expect(screen.queryByText("32.6")).not.toBeInTheDocument();
  expect(screen.queryByText(RAIN_UNIT)).not.toBeInTheDocument();
});

it.each([
  ["explore-today", ExploreToday],
  ["grenada-in-data", GrenadaInData],
])("hides %s on request", async (key, Section) => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({ hiddenSections: [key] })
  );
  expect(await Section()).toBeNull();
});
