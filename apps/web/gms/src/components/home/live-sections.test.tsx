import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  avatarInitials,
  Explained,
  ForecastDesk,
  Stories,
} from "@/components/home/live-sections";
import { fetchActiveAlerts } from "@/lib/cap";
import { postedLabel } from "@/lib/clock";
import {
  fetchHomeContent,
  type HomeContent,
  type PublishedContent,
} from "@/lib/cms";
import { fetchPublishedProduct, fetchPublishedProducts } from "@/lib/products";

vi.mock("@/lib/products", () => ({
  fetchPublishedProduct: vi.fn(),
  fetchPublishedProducts: vi.fn(),
}));
vi.mock("@/lib/cap", () => ({ fetchActiveAlerts: vi.fn() }));

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
beforeEach(() => {
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [],
  });
  vi.mocked(fetchActiveAlerts).mockResolvedValue({
    status: "ok",
    groups: [],
    activeCount: 0,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const hidden = (sections: string[]): HomeContent => ({
  deskUpdates: { status: "ok", articles: [] },
  stories: { status: "ok", articles: [] },
  questions: { status: "ok", questions: [] },
  reportNotes: { status: "ok", articles: [] },
  livePosts: { status: "ok", posts: [] },
  weatherNow: null,
  discover: null,
  settings: {
    discoverCards: [],
    hiddenSections: sections,
    sectionCopy: {},
    exploreReading: {},
  },
});

const READ_ARTICLE = /^Read the article: /;
const DUTY_FORECASTER = /Duty forecaster ·/;
const WATCH_ON_YOUTUBE = /^Watch on YouTube/;

it("labels a post Today, Yesterday or by date, in Grenada time", () => {
  const post = "2026-10-28T02:00:00Z"; // 27 Oct, 22:00 in Grenada
  expect(postedLabel(post, new Date("2026-10-28T03:30:00Z"))).toBe(
    "Today at 10:00 p.m."
  );
  expect(postedLabel(post, new Date("2026-10-28T05:00:00Z"))).toBe(
    "Yesterday at 10:00 p.m."
  );
  expect(postedLabel(post, new Date("2026-10-29T13:00:00Z"))).toBe(
    "27 Oct at 10:00 p.m."
  );
});

it("drops sections editors hide", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    hidden(["stories", "questions"])
  );
  expect(await Stories()).toBeNull();
  expect(await Explained()).toBeNull();
});

it("lists six stories beside the lead, three on phones", async () => {
  const articles: PublishedContent[] = Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    collection: "stories",
    title: `Story ${i}`,
    slug: `story-${i}`,
    summary: "Summary.",
    body: "Body.",
    imageUrl: null,
    updatedAt: "2026-10-30T02:30:00Z",
    publishedAt: "2026-10-30T02:30:00Z",
    linkedProduct: null,
  }));
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    stories: { status: "ok", articles },
  });
  render(await Stories());
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(6);
  expect(
    rows.slice(0, 3).every((row) => !row.className.includes("hidden"))
  ).toBe(true);
  expect(
    rows.slice(3).every((row) => row.className.includes("hidden sm:block"))
  ).toBe(true);
});

it("leaves report write-ups out of the feed when editors hide reports", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden(["reports"]),
    reportNotes: {
      status: "ok",
      articles: [post({ collection: "report-notes", title: "Hidden note" })],
    },
  });
  render(await ForecastDesk());
  expect(screen.queryByText("Hidden note")).not.toBeInTheDocument();
});

it("shows an empty state, not a stale list, when no questions are published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await Explained());
  expect(
    screen.getByText("No questions are published yet.")
  ).toBeInTheDocument();
});

type HomeAlertGroup = Extract<
  Awaited<ReturnType<typeof fetchActiveAlerts>>,
  { status: "ok" }
>["groups"][number];

const post = (overrides: Partial<PublishedContent>): PublishedContent => ({
  id: "1",
  collection: "desk-updates",
  title: "Why the morning forecast changed",
  slug: "updates/2026/09/why",
  summary: "The midday issue refines this morning's rain timing.",
  body: "",
  imageUrl: null,
  updatedAt: "2026-09-30T12:00:00Z",
  ...overrides,
});
const PRODUCT_ID = "0b3c6f1e-1111-4a2b-9c3d-222233334444";

it("links each desk post card to its article; a linked product stays a label", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({ linkedProduct: { productId: PRODUCT_ID, kind: "midday" } }),
        post({ id: "2", title: "New marine page", slug: "updates/2026/09/m" }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(screen.queryByText("Official forecast")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Why the morning forecast changed" })
  ).toHaveAttribute("href", "/explore/updates/2026/09/why");
  expect(screen.queryByText("Official product")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: READ_ARTICLE })).toHaveLength(2);
  // Each card is positioned so the link's screen-reader text stays inside the
  // scrolling row instead of widening the page on phones.
  for (const link of screen.getAllByRole("link", { name: READ_ARTICLE })) {
    expect(link.closest("li")).toHaveClass("relative");
  }
  expect(screen.getByText("New marine page")).toBeInTheDocument();
  expect(screen.getAllByText("The forecasters")).toHaveLength(2);
});

it("says so honestly when nothing is published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await ForecastDesk());
  expect(
    screen.getByText("No forecasts or desk posts are published yet.")
  ).toBeInTheDocument();
});

it("puts report write-ups in the feed, labelled with their product, never as a product card", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    reportNotes: {
      status: "ok",
      articles: [
        post({
          id: "2",
          collection: "report-notes",
          slug: "reports/2026/09/outlook",
          title: "Two waves to watch",
          linkedProduct: { productId: PRODUCT_ID, kind: "outlook" },
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(
    screen.getByRole("link", { name: "Two waves to watch" })
  ).toHaveAttribute("href", "/explore/reports/2026/09/outlook");
  expect(screen.getByText("Tropical Weather Outlook")).toBeInTheDocument();
  expect(fetchPublishedProduct).not.toHaveBeenCalled();
});

const MIDDAY = {
  id: PRODUCT_ID,
  revision: 1,
  publishedAt: "2026-11-01T16:00:00Z",
  kind: "midday" as const,
  values: { issuedAt: "2026-11-01T12:00", summary: "Hazy, a few showers." },
};

it("pins the latest issued forecast first, as an official card", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "ok", articles: [post({})] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  render(await ForecastDesk());
  const cards = screen.getAllByRole("listitem");
  expect(cards[0]).toHaveTextContent("Official briefing");
  expect(cards[0]).toHaveTextContent("Hazy, a few showers.");
  expect(
    screen.getByRole("link", { name: "Read the Midday Forecast" })
  ).toHaveAttribute("href", `/weather/issued/${PRODUCT_ID}`);
});

it("keeps desk posts behind Earlier posts during a red warning", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "ok", articles: [post({})] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  vi.mocked(fetchActiveAlerts).mockResolvedValue({
    status: "ok",
    activeCount: 1,
    groups: [
      {
        alerts: [{ severity: "Extreme", status: "Actual" }],
      } as unknown as HomeAlertGroup,
    ],
  });
  render(await ForecastDesk());
  expect(screen.getByText("Earlier posts (1)")).toBeInTheDocument();
  expect(
    screen.getByRole("list", { name: "Latest from the forecast desk" })
  ).not.toHaveTextContent("Why the morning forecast changed");
});

it("shows the author's role, the post type, the picture credit and a click-to-open media link", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          authorName: "Kendra Mitchell",
          authorRole: "Duty forecaster",
          format: "video",
          mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          imageUrl: "https://cms.example/media/still.jpg",
          imageCredit: "Photo: GMS",
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(screen.getByText("Kendra Mitchell")).toBeInTheDocument();
  expect(screen.getByText(DUTY_FORECASTER)).toBeInTheDocument();
  expect(screen.getByText("Watch")).toBeInTheDocument();
  expect(screen.getByText("Photo: GMS")).toBeInTheDocument();
  const watch = screen.getByRole("link", { name: WATCH_ON_YOUTUBE });
  expect(watch).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  expect(document.querySelector("iframe")).toBeNull();
});

it("signs a desk card with the author's name and initials, with their picture", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          authorName: "Eugine Whint",
          imageUrl: "https://weather.barrels.gd/media/rain-map.png",
          imageAlt: "Rain map for tonight",
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(screen.getByText("Eugine Whint")).toBeInTheDocument();
  expect(screen.getByText("EW")).toBeInTheDocument();
  expect(screen.queryByText("The forecasters")).not.toBeInTheDocument();
  expect(screen.getByAltText("Rain map for tonight")).toBeInTheDocument();
});

it("makes avatar initials from a name, and falls back to GMS", () => {
  expect(avatarInitials("Eugine Whint")).toBe("EW");
  expect(avatarInitials("eugine.whint")).toBe("EW");
  expect(avatarInitials("forecaster")).toBe("FO");
  expect(avatarInitials(null)).toBe("GMS");
  expect(avatarInitials("  ")).toBe("GMS");
});
