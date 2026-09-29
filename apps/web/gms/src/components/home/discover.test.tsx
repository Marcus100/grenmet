import { cleanup, render, screen } from "@testing-library/react";
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

const SUN_TIMES = /Sunrise 0\d:\d\d · sunset 1\d:\d\d/;
const CLOUD_QUIZ = /Can you name these five clouds/;
const RAINBOWS = /Where rainbows are/;
const NOW = new Date("2026-09-29T15:00:00Z");
function home(overrides: Partial<HomeContent> = {}): HomeContent {
  const none = { status: "ok" as const, articles: [] };
  return {
    deskUpdates: none,
    stories: none,
    publications: none,
    questions: { status: "ok", questions: [] },
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

it("follows the editors' card choice and drops cards with no entry", async () => {
  const content = home({
    settings: { discoverCards: ["quiz", "on-this-day"], hiddenSections: [] },
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
    home({ settings: { discoverCards: ["sky"], hiddenSections: ["discover"] } })
  );
  expect(await Discover({ now: NOW })).toBeNull();
});

it("lets an editor's sky note lead the sky card", () => {
  const card = skyCard(NOW, {
    title: "Perseids tonight",
    note: "Look north-east.",
  });
  expect(card.title).toBe("Perseids tonight");
  expect(card.detail).toBe("Look north-east.");
});
