import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Discover, skyCard } from "@/components/home/discover";
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

const SUN_TIMES = /Sunrise \d:\d\d a\.m\. · sunset \d:\d\d p\.m\./u;
const MOON_PHASE_WORDS = /\blit\b|Waxing|Waning|Full Moon|New Moon|Quarter/u;
const CLOUD_QUIZ = /Can you name these five clouds/u;
const RAINBOWS = /Where rainbows are/u;
const NOW = new Date("2026-09-29T15:00:00Z");
function home(overrides: Partial<HomeContent> = {}): HomeContent {
  const none = { status: "ok" as const, articles: [] };
  return {
    deskUpdates: none,
    stories: none,
    questions: { status: "ok", questions: [] },
    reportNotes: { status: "ok", articles: [] },
    livePosts: { status: "ok", posts: [] },
    weatherNow: null,
    discover: {
      today: "2026-09-29",
      onThisDay: {
        title: "Hurricane Janet crosses Grenada",
        day: 22,
        month: 9,
        year: 1955,
        whatHappened: "Janet swept across Grenada and Carriacou.",
        imageUrl: null,
        story: null,
      },
      quiz: {
        title: "Can you name these five clouds?",
        slug: "discover/can-you-name-these-five-clouds",
        intro: null,
        questionCount: 5,
      },
      fact: {
        title: "Where rainbows are",
        fact: "The sun is behind you.",
        source: "Met Office",
        sourceUrl: "https://example.test/rainbows",
      },
      skyNote: null,
    },
    settings: {
      discoverCards: ["sky", "on-this-day", "quiz", "fact"],
      hiddenSections: [],
      sectionCopy: {},
      exploreReading: {},
    },
    ...overrides,
  };
}

it("shows the calculated sky and each published card, linked", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home());
  render(await Discover({ now: NOW }));
  expect(screen.getByText(SUN_TIMES)).toBeInTheDocument();
  expect(
    screen.getByText("On this day · 22 September 1955")
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: CLOUD_QUIZ })).toHaveAttribute(
    "href",
    "/explore/quiz/can-you-name-these-five-clouds"
  );
  expect(screen.getByRole("link", { name: RAINBOWS })).toHaveAttribute(
    "href",
    "https://example.test/rainbows"
  );
});

it("names a fact's source once and keeps every card's text to four lines", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home());
  render(await Discover({ now: NOW }));
  const fact = screen.getByRole("link", { name: RAINBOWS });
  expect(
    within(fact).getAllByText("Met Office", { exact: false })
  ).toHaveLength(1);
  expect(within(fact).getByText("Source: Met Office")).toBeInTheDocument();
  expect(within(fact).getByText("The sun is behind you.")).toHaveClass(
    "line-clamp-4"
  );
});

it("follows the editors' card choice and drops cards with no entry", async () => {
  const content = home({
    settings: {
      discoverCards: ["quiz", "on-this-day"],
      hiddenSections: [],
      sectionCopy: {},
      exploreReading: {},
    },
  });
  if (content.discover) content.discover.onThisDay = null;
  vi.mocked(fetchHomeContent).mockResolvedValue(content);
  render(await Discover({ now: NOW }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("Tonight")).not.toBeInTheDocument();
});

it("keeps the sky card when the CMS is down, and hides on request", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(home({ discover: null }));
  render(await Discover({ now: NOW }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      settings: {
        discoverCards: ["sky"],
        hiddenSections: ["discover"],
        sectionCopy: {},
        exploreReading: {},
      },
    })
  );
  expect(await Discover({ now: NOW })).toBeNull();
});

it("shows no calculated moon phase; the tile says it is coming and keeps the sun times", () => {
  const card = skyCard(NOW, null);
  expect(card.title).toBe("Moon and tides coming soon");
  expect(card.title).not.toMatch(MOON_PHASE_WORDS);
  expect(card.detail).toMatch(SUN_TIMES);
});

it("keeps the Discover section with the moon tile alone when no CMS card is published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    home({
      discover: null,
      settings: {
        discoverCards: ["sky", "on-this-day", "quiz", "fact"],
        hiddenSections: [],
        sectionCopy: {},
        exploreReading: {},
      },
    })
  );
  render(await Discover({ now: NOW }));
  expect(screen.getByText("Moon and tides coming soon")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("lets an editor's sky note lead the sky card", () => {
  const card = skyCard(NOW, {
    title: "Perseids tonight",
    note: "Look north-east.",
  });
  expect(card.title).toBe("Perseids tonight");
  expect(card.detail).toBe("Look north-east.");
});
