import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  Explained,
  ForecastDesk,
  GetAlertsStrip,
  LatestReports,
  Stories,
} from "@/components/home/live-sections";
import {
  fetchHomeContent,
  type HomeContent,
  type PublishedContent,
} from "@/lib/cms";
import { fetchPublishedProduct } from "@/lib/products";

vi.mock("@/lib/products", () => ({ fetchPublishedProduct: vi.fn() }));
// The card is an async server component; it has its own tests.
vi.mock("@/components/linked-product", () => ({
  LinkedProduct: ({ productId }: { productId: string }) => (
    <p>Linked product {productId}</p>
  ),
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

it("drops sections editors hide", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    hidden(["stories", "questions"])
  );
  expect(await Stories()).toBeNull();
  expect(await Explained()).toBeNull();
});

it("hides Latest reports when editors hide it", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden(["reports"]));
  expect(await LatestReports()).toBeNull();
});

it("offers the alerts sign-up as its own strip", () => {
  render(<GetAlertsStrip />);
  expect(
    screen.getByRole("heading", { name: "Get official alerts first" })
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Get the app" })).toHaveAttribute(
    "href",
    "/app-guide"
  );
});

it("shows an empty state, not a stale list, when no questions are published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await Explained());
  expect(
    screen.getByText("No questions are published yet.")
  ).toBeInTheDocument();
});

const TWO_WAVES = /Two waves to watch/;

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

it("is a blog: desk posts with their live product, never the forecast itself", async () => {
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
  expect(screen.getByText(`Linked product ${PRODUCT_ID}`)).toBeInTheDocument();
  expect(screen.getByText("New marine page")).toBeInTheDocument();
});

it("shows only report write-ups, with an honest empty state", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await LatestReports());
  expect(
    screen.getByText("No report write-ups are published yet.")
  ).toBeInTheDocument();
  expect(fetchPublishedProduct).not.toHaveBeenCalled();
});

it("leads report write-ups with their live product and links each write-up", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue({
    ...hidden([]),
    reportNotes: {
      status: "ok",
      articles: [
        post({
          collection: "report-notes",
          slug: "reports/2026/09/flood",
          title: "Understanding the flood bulletin",
          linkedProduct: { productId: PRODUCT_ID, kind: "flood" },
        }),
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
  render(await LatestReports());
  expect(
    screen.getByRole("link", { name: "Understanding the flood bulletin" })
  ).toHaveAttribute("href", "/explore/reports/2026/09/flood");
  expect(screen.getByText(`Linked product ${PRODUCT_ID}`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: TWO_WAVES })).toHaveAttribute(
    "href",
    "/explore/reports/2026/09/outlook"
  );
});
