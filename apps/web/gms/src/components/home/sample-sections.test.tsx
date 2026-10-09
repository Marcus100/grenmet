import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExploreToday, GrenadaInData } from "@/components/home/sample-sections";
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

const RIP_LINK = /Tourism:.*Read: What is a rip current\?/;
const READ_MORE = /^Read:/;

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

it("shows each sector's hazard and its impact level", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({}));
  render(await ExploreToday());
  for (const [sector, href] of [
    ["Tourism", "/services/tourism"],
    ["Fisheries", "/marine/fishing"],
    ["Aviation", "/services/aviation"],
    ["Agriculture", "/services/agriculture"],
    ["Construction", "/services/construction"],
    ["Health", "/services/health"],
  ]) {
    expect(screen.getByText(sector).closest("a")).toHaveAttribute("href", href);
  }
  expect(screen.getAllByRole("img", { name: "Minor impact" })).toHaveLength(5);
  expect(screen.getAllByRole("img", { name: "Minimal impact" })).toHaveLength(
    1
  );
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

it.each([
  ["explore-today", ExploreToday],
  ["grenada-in-data", GrenadaInData],
])("hides %s on request", async (key, Section) => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({ hiddenSections: [key] })
  );
  expect(await Section()).toBeNull();
});
