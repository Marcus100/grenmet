import type { PublicMonthSummary, SectorOutlook } from "@barrelsgd/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExploreToday, GrenadaInData } from "@/components/home/data-sections";
import { fetchHomeContent, type HomeContent } from "@/lib/cms";
import { fetchMonthSummary, fetchSectorOutlook } from "@/lib/products";

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
vi.mock("@/lib/products", () => ({
  fetchMonthSummary: vi.fn(),
  fetchSectorOutlook: vi.fn(),
}));
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

const OLD_READING = /90 minutes/;
const MONTH_TO_DATE = /Month to date/;
const ORANGE_LEVEL = /Orange level/;
const GREEN_LEVEL = /Green level/;
const MINIMAL_OR_NONE = /minimal|no impact/i;
const NO_IMPACTS = /No alert or warning impacts/;

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

const outlookItem = (
  overrides: Partial<SectorOutlook["items"][number]> = {}
): SectorOutlook["items"][number] => ({
  source: "CAP",
  title: "Heavy Rainfall Warning",
  product: "Warning",
  colour: "orange",
  likelihood: "Medium",
  impact: "Significant",
  impacts:
    "Flash flooding is possible in low-lying areas. Avoid crossing rivers.",
  response: "Avoid flooded roads.",
  valid_from: "2026-10-28T10:00:00Z",
  valid_to: "2026-10-30T22:00:00Z",
  reference: "CAP GMS-1",
  identifier: "GMS-1",
  product_id: null,
  sectors: ["agriculture", "roads-transport"],
  affects_everyone: false,
  ...overrides,
});
const outlook = (
  items: SectorOutlook["items"],
  complete = true
): SectorOutlook => ({
  as_of: "2026-10-28T15:00:00Z",
  window_start: "2026-10-28T04:00:00Z",
  window_end: "2026-11-04T04:00:00Z",
  complete,
  items,
});
const tile = (name: string) => {
  const section = screen.getByRole("region", { name });
  return within(section);
};

it("links each sector to its service page", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([]));
  render(await ExploreToday());
  for (const [sector, href] of [
    ["Tourism & outdoors", "/services/tourism"],
    ["Marine", "/marine"],
    ["Aviation", "/services/aviation"],
    ["Agriculture", "/services/agriculture"],
    ["Health", "/services/health"],
    ["Roads & transport", "/services/roads-transport"],
  ] as const) {
    expect(tile(sector).getByRole("link", { name: sector })).toHaveAttribute(
      "href",
      href
    );
  }
});

it("shows each tagged item under its sectors only, and says what is untagged", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(
    outlook([
      outlookItem(),
      outlookItem({
        title: "Small craft advisory",
        impacts: "Choppy seas near the coast.",
        identifier: null,
        source: "Bulletin",
        product_id: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
        colour: "green",
        sectors: [],
        affects_everyone: true,
      }),
    ])
  );
  render(await ExploreToday());
  const farming = tile("Agriculture");
  expect(
    farming.getByRole("link", { name: "Heavy Rainfall Warning" })
  ).toHaveAttribute("href", "/alerts/GMS-1");
  expect(farming.getByText(ORANGE_LEVEL)).toBeInTheDocument();
  expect(
    farming.getByText("Flash flooding is possible in low-lying areas.")
  ).toBeInTheDocument();
  expect(tile("Marine").queryByText("Heavy Rainfall Warning")).toBeNull();
  // Untagged: under every sector, labelled, linking to the issued bulletin.
  for (const sector of ["Agriculture", "Marine", "Health"]) {
    expect(tile(sector).getByText("Affects everyone")).toBeInTheDocument();
  }
  expect(
    tile("Health").getByRole("link", { name: "Small craft advisory" })
  ).toHaveAttribute(
    "href",
    "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444"
  );
  expect(tile("Marine").getByText(GREEN_LEVEL)).toBeInTheDocument();
});

it("says nothing is published for a sector, never that there is no impact", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([outlookItem()]));
  render(await ExploreToday());
  expect(
    tile("Aviation").getByText(
      "No alert or warning impacts published for this sector."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(MINIMAL_OR_NONE)).toBeNull();
});

it("says so when the feed is unavailable or only partly read, and shows no all-clear", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(null);
  render(await ExploreToday());
  expect(screen.getByRole("status")).toHaveTextContent("can't be loaded");
  expect(screen.queryByText(NO_IMPACTS)).toBeNull();
  cleanup();
  vi.mocked(fetchSectorOutlook).mockResolvedValue(
    outlook([outlookItem()], false)
  );
  render(await ExploreToday());
  expect(screen.getByRole("status")).toHaveTextContent("may be incomplete");
});

it("shows three items a tile and counts the rest", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(
    outlook(
      ["A", "B", "C", "D", "E"].map((name) =>
        outlookItem({
          title: `Alert ${name}`,
          identifier: name,
          sectors: ["health"],
        })
      )
    )
  );
  render(await ExploreToday());
  const health = tile("Health");
  expect(health.getAllByRole("listitem")).toHaveLength(3);
  expect(
    health.getByRole("link", { name: "2 more in alerts" })
  ).toHaveAttribute("href", "/alerts");
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
  // No "Month to date · … · provisional · to 18 October" line (owner, 28 Oct 2026).
  expect(screen.queryByText(MONTH_TO_DATE)).not.toBeInTheDocument();
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

it("fills the impact meter a quarter per level, in that level's colour, grey when nothing is published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  vi.mocked(fetchSectorOutlook).mockResolvedValue(
    outlook([
      outlookItem(),
      outlookItem({
        title: "Small craft advisory",
        identifier: null,
        product_id: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
        source: "Bulletin",
        colour: "green",
        sectors: ["marine"],
        affects_everyone: false,
      }),
    ])
  );
  render(await ExploreToday());
  const meter = (sector: string) => tile(sector).getByRole("meter");
  const blocks = (sector: string) =>
    Array.from(meter(sector).nextElementSibling?.children ?? []);
  const filled = (sector: string) =>
    blocks(sector).filter(
      (block) => (block as HTMLElement).style.background !== ""
    ).length;
  // The orange rainfall warning is tagged for agriculture: three quarters.
  expect(meter("Agriculture")).toHaveAttribute("value", "3");
  expect(filled("Agriculture")).toBe(12);
  // A green advisory for marine: one quarter.
  expect(meter("Marine")).toHaveAttribute("value", "1");
  expect(filled("Marine")).toBe(4);
  // Nothing for aviation: every block grey, and said in words.
  expect(meter("Aviation")).toHaveAttribute("value", "0");
  expect(filled("Aviation")).toBe(0);
  expect(blocks("Aviation")).toHaveLength(16);
});
