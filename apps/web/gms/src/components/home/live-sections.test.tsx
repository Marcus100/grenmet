import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  avatarInitials,
  deskPostVisibility,
  Explained,
  ForecastDesk,
  Stories,
} from "@/components/home/live-sections";
import { fetchActiveAlerts, fetchPublicAlert } from "@/lib/cap";
import { postedLabel } from "@/lib/clock";
import {
  fetchHomeContent,
  type HomeContent,
  type PublishedContent,
} from "@/lib/cms";
import {
  fetchPublishedProduct,
  fetchPublishedProducts,
  fetchSectorOutlook,
} from "@/lib/products";

vi.mock("@/lib/products", () => ({
  fetchPublishedProduct: vi.fn(),
  fetchPublishedProducts: vi.fn(),
  fetchSectorOutlook: vi.fn(),
}));
vi.mock("@/lib/cap", () => ({
  fetchActiveAlerts: vi.fn(),
  fetchPublicAlert: vi.fn(),
}));

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
  vi.mocked(fetchSectorOutlook).mockResolvedValue(null);
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

const READ_ARTICLE = /^Read the article: /u;
const DUTY_FORECASTER = /Duty forecaster ·/u;
const WATCH_ON_YOUTUBE = /^Watch on YouTube/u;
const ISSUED_UNAVAILABLE = /Issued forecasts cannot be retrieved right now/u;
const NO_FORECAST = /No public forecast is in effect right now/u;
const BASED_ON = /^Based on/u;

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

it("says so honestly when nothing is published and the sector card is hidden", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden(["explore-today"]));
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "unavailable",
    products: [],
  });
  render(await ForecastDesk());
  expect(screen.getByText(ISSUED_UNAVAILABLE)).toBeInTheDocument();
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

it("shows a placeholder briefing when no public forecast is in effect", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await ForecastDesk());
  const [first] = screen.getAllByRole("listitem");
  expect(first).toHaveTextContent(NO_FORECAST);
  expect(first).toHaveTextContent("Official briefing");
});

it("puts the sector card in the row, after the official cards and before the posts", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "ok", articles: [post({})] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  render(await ForecastDesk());
  const cards = screen
    .getAllByRole("listitem")
    .filter((card) => card.classList.contains("snap-start"));
  expect(cards[0]).toHaveTextContent("Official briefing");
  expect(cards[1]).toHaveTextContent("Plan your week");
  expect(cards[2]).toHaveTextContent("Why the morning forecast changed");
});

it("still shows the week's sector card when nothing else is published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await ForecastDesk());
  expect(
    screen.getByRole("link", { name: "See the whole week" })
  ).toHaveAttribute("href", "/plan-your-week");
  expect(
    screen.queryByText("No forecasts or desk posts are published yet.")
  ).not.toBeInTheDocument();
});

it("shows both the unavailable notice and the sector card when desk updates cannot be read", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "unavailable", articles: [] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [],
  });
  render(await ForecastDesk());
  expect(
    screen.getAllByText("Desk updates cannot be retrieved right now.")
  ).not.toHaveLength(0);
  expect(
    screen.getByRole("link", { name: "See the whole week" })
  ).toBeInTheDocument();
});

it("keeps the week's sector card when editors hide the desk", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden(["desk"]));
  render(await ForecastDesk());
  // The section heading names it once; the card drops its own byline.
  expect(
    screen.getAllByRole("heading", { name: "Plan your week" })
  ).toHaveLength(1);
  expect(screen.getAllByText("Plan your week")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveAccessibleName(
    "This week's alerts and warnings"
  );
  expect(screen.queryByText("From the Desk")).not.toBeInTheDocument();
});

it("asks for the sector outlook without waiting for the products", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  vi.mocked(fetchPublishedProducts).mockReturnValue(
    new Promise(() => undefined)
  );
  vi.mocked(fetchSectorOutlook).mockClear();
  // The products never settle, so the outlook was requested alongside them.
  ForecastDesk();
  await vi.waitFor(() => expect(fetchSectorOutlook).toHaveBeenCalled());
});

it("leaves nothing behind when editors hide both the desk and the sector card", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    hidden(["desk", "explore-today"])
  );
  expect(await ForecastDesk()).toBeNull();
});

const RED_WARNING_ISSUED = "2026-10-31T12:00:00Z";

/** A red (Extreme) warning in effect, with its CAP detail's issue time. */
function redWarning(sent: string = RED_WARNING_ISSUED) {
  vi.mocked(fetchActiveAlerts).mockResolvedValue({
    status: "ok",
    activeCount: 1,
    groups: [
      {
        alerts: [
          {
            identifier: "red-1",
            severity: "Extreme",
            status: "Actual",
          },
        ],
      } as unknown as HomeAlertGroup,
    ],
  });
  vi.mocked(fetchPublicAlert).mockResolvedValue({
    status: "ok",
    alert: { identifier: "red-1", sent },
  } as unknown as Awaited<ReturnType<typeof fetchPublicAlert>>);
}

it("keeps desk posts older than a red warning behind Earlier posts", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "ok", articles: [post({})] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  redWarning();
  render(await ForecastDesk());
  expect(screen.getByText("Earlier posts (1)")).toBeInTheDocument();
  expect(
    screen.getByRole("list", { name: "Latest from the forecast desk" })
  ).not.toHaveTextContent("Why the morning forecast changed");
});

it("keeps desk posts newer than a red warning visible under it", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          id: "new",
          title: "Newer post",
          slug: "updates/2026/11/new",
          publishedAt: "2026-11-01T09:00:00Z",
        }),
        post({
          id: "old",
          title: "Older post",
          slug: "updates/2026/10/old",
          publishedAt: "2026-10-30T09:00:00Z",
        }),
      ],
    },
  });
  redWarning();
  render(await ForecastDesk());
  expect(screen.getByText("Earlier posts (1)")).toBeInTheDocument();
  const row = screen.getByRole("list", {
    name: "Latest from the forecast desk",
  });
  expect(row).toHaveTextContent("Newer post");
  expect(row).not.toHaveTextContent("Older post");
  expect(
    screen.getByRole("list", { name: "Earlier desk posts" })
  ).toHaveTextContent("Older post");
});

it("puts every desk post behind Earlier posts when the red warning's time is unknown", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          publishedAt: "2026-11-01T09:00:00Z",
        }),
      ],
    },
  });
  redWarning();
  vi.mocked(fetchPublicAlert).mockResolvedValue({ status: "unavailable" });
  render(await ForecastDesk());
  expect(screen.getByText("Earlier posts (1)")).toBeInTheDocument();
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

it("says which issued product a desk post is based on, linked to its page", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          basedOn: {
            productId: PRODUCT_ID,
            title: "Evening Forecast · issued 2026-10-27 18:00",
          },
        }),
        post({
          id: "2",
          title: "Community day",
          slug: "updates/2026/09/c",
          basedOn: null,
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(
    screen.getByRole("link", {
      name: "the Evening Forecast · issued 2026-10-27 18:00",
    })
  ).toHaveAttribute("href", `/weather/issued/${PRODUCT_ID}`);
  expect(screen.getAllByText(BASED_ON)).toHaveLength(1);
});

it("encodes an odd issued product id in the based-on link", async () => {
  const oddId = "odd/id?x=1 #frag";
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({ basedOn: { productId: oddId, title: "Evening Forecast" } }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(
    screen.getByRole("link", { name: "the Evening Forecast" })
  ).toHaveAttribute("href", `/weather/issued/${encodeURIComponent(oddId)}`);
});

it("keeps a pinned desk post right after the official cards", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({ id: "1", title: "Newest post", slug: "updates/2026/10/n" }),
        post({
          id: "2",
          title: "Pinned post",
          slug: "updates/2026/09/p",
          pinned: true,
        }),
      ],
    },
  });
  render(await ForecastDesk());
  const titles = screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
  expect(titles.indexOf("Pinned post")).toBeLessThan(
    titles.indexOf("Newest post")
  );
});

it("puts the picture of the pinned desk post based on a product on its official card", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          pinned: true,
          basedOn: { productId: PRODUCT_ID, title: "Midday Forecast" },
          imageUrl: "https://cms.example/media/rain-map.png",
          imageAlt: "Rain map for the afternoon",
          imageCredit: "Photo: Kendra Mitchell",
        }),
      ],
    },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  render(await ForecastDesk());
  // The official card and the pinned desk post in the row both show it.
  expect(screen.getAllByAltText("Rain map for the afternoon")).toHaveLength(2);
  expect(screen.getAllByText("Photo: Kendra Mitchell")).toHaveLength(2);
  // Only the sector card is left without a picture.
  expect(screen.getAllByText("No picture yet")).toHaveLength(1);
});

it("says No picture yet on an official card and the sector card when no desk post is based on it", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: { status: "ok", articles: [post({})] },
  });
  vi.mocked(fetchPublishedProducts).mockResolvedValue({
    status: "ok",
    products: [MIDDAY],
  });
  render(await ForecastDesk());
  // The official card and the sector card each keep their picture area.
  expect(screen.getAllByText("No picture yet")).toHaveLength(2);
});

it("credits every desk post picture, defaulting to Photo: GMS", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          imageUrl: "https://cms.example/media/rain.png",
          imageAlt: "Rain",
          imageCredit: null,
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(screen.getByText("Photo: GMS")).toBeInTheDocument();
});

it("loads a desk post's video only when the reader presses play", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    deskUpdates: {
      status: "ok",
      articles: [
        post({
          format: "video",
          mediaUrl: "https://youtu.be/dQw4w9WgXcQ",
          title: "Rain briefing",
        }),
      ],
    },
  });
  render(await ForecastDesk());
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Play video from YouTube" })
  );
  const frame = screen.getByTitle("Rain briefing");
  expect(frame.tagName).toBe("IFRAME");
  expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
  );
  expect(
    screen.getByRole("link", { name: WATCH_ON_YOUTUBE })
  ).toBeInTheDocument();
});

it("credits every story picture, and says Unsplash for the stock fallback", async () => {
  const articles: PublishedContent[] = [
    {
      ...post({ id: "lead", slug: "stories/lead", title: "Lead story" }),
      collection: "stories",
      imageUrl: "https://cms.example/media/lead.jpg",
      imageCredit: "Photo: Kendra Mitchell",
    },
    {
      ...post({ id: "thumb", slug: "stories/thumb", title: "Thumb story" }),
      collection: "stories",
      imageUrl: "https://cms.example/media/thumb.jpg",
      imageCredit: null,
    },
    {
      ...post({ id: "stock", slug: "stories/stock", title: "Stock story" }),
      collection: "stories",
      imageUrl: null,
    },
  ];
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    stories: { status: "ok", articles },
  });
  render(await Stories());
  expect(screen.getByText("Photo: Kendra Mitchell")).toBeInTheDocument();
  expect(screen.getByText("Photo: GMS")).toBeInTheDocument();
  expect(screen.getByText("Photo: Unsplash")).toBeInTheDocument();
});

it("hides only desk posts that have no place left in the row", () => {
  // Two pinned cards (forecast, warnings): posts 1 and 2 fill four places on
  // laptops; on portrait tablets only post 1 fits.
  expect(deskPostVisibility(0, 2)).toBe("");
  expect(deskPostVisibility(1, 2)).toBe("md:max-lg:hidden");
  expect(deskPostVisibility(2, 2)).toBe("md:hidden");
  // Pinned cards never hide: with five pinned, every post waits for "All desk posts".
  expect(deskPostVisibility(0, 5)).toBe("md:hidden");
  expect(deskPostVisibility(0, 0)).toBe("");
  expect(deskPostVisibility(3, 0)).toBe("md:max-lg:hidden");
  expect(deskPostVisibility(4, 0)).toBe("md:hidden");
});
