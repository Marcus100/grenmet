import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveInvitation, DemoNote, StoryCard } from "@/components/editorial";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedArticles } from "@/lib/content";
import SectionPage from "./[section]/page";
import AboutPage from "./about/page";
import ArchivePage from "./archive/page";
import BriefsPage from "./briefs/page";
import CollectionPage from "./collections/[slug]/page";
import LearnPage from "./learn/page";
import NotFound from "./not-found";
import HomePage from "./page";
import SearchPage from "./search/page";
import TopicsPage from "./topics/page";

const SAMPLE_NOTICE = /Human editorial review pending/;
const SAMPLE_CAUTION = /Do not rely on it/;
vi.mock("@/lib/content", () => {
  const articles = [
    {
      title: "Sample dust story",
      dek: "What hazy skies mean.",
      section: "weather-ready",
      slug: "saharan-dust",
      author: "Signal Desk",
      publishedAt: "2026-06-13",
      draft: false,
      heroImage: "/images/placeholder-green.svg",
    },
    {
      title: "Sample sea story",
      dek: "Conditions at sea.",
      section: "weather-ready",
      slug: "small-craft-advisory",
      author: "Signal Desk",
      publishedAt: "2026-06-12",
      draft: false,
    },
    {
      title: "Sample opportunity",
      dek: "Scholarship information.",
      section: "opportunity",
      slug: "scholarship",
      author: "Signal Desk",
      publishedAt: "2026-06-11",
      draft: false,
    },
  ];
  const brief = {
    title: "A sample morning",
    date: "2026-06-13",
    presenter: "Signal Desk",
    dek: "The essentials.",
  };
  return {
    getPublishedArticles: () => articles,
    getCurrentArticles: () => [
      {
        ...articles[0],
        title: "Selected lead",
        section: "news-community",
        slug: "parliament-dissolved-2026",
      },
      {
        ...articles[0],
        title: "Selected film",
        section: "culture-life",
        slug: "grenada-film-festival-october-2026",
      },
      {
        ...articles[0],
        title: "Selected opportunity",
        section: "opportunity",
        slug: "chevening-grenada-deadline-2026",
      },
    ],
    getLatestBrief: () => brief,
    getBriefs: () => [brief],
    getArticlesBySection: (section: string) =>
      articles.filter((article) => article.section === section),
  };
});
afterEach(cleanup);
describe("editorial reader", () => {
  it("leads with the dated briefing, then stories, collection and archive", () => {
    const { container } = render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Daily Signal"
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("Daily Signal")).toBeLessThan(
      text.indexOf("Selected lead")
    );
    expect(text.indexOf("Selected lead")).toBeLessThan(
      text.indexOf("October in Grenada")
    );
    expect(text.indexOf("October in Grenada")).toBeLessThan(
      text.indexOf("Stay curious.")
    );
    expect(container.querySelector("input[type=email]")).toBeNull();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sport →")).not.toBeInTheDocument();
  });
  it("has working navigation without inactive signup or social links", () => {
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>
    );
    expect(screen.queryByText(SAMPLE_NOTICE)).not.toBeInTheDocument();
    const navigation = within(
      screen.getByRole("navigation", { name: "Main navigation" })
    );
    for (const [name, href] of [
      ["News", "/news-community"],
      ["Entertainment", "/culture-life"],
      ["Sport", "/sport"],
      ["Money", "/opportunity"],
      ["Caribbean & World", "/grenada-world"],
    ]) {
      expect(navigation.getByRole("link", { name })).toHaveAttribute(
        "href",
        href
      );
    }
    for (const link of screen.getAllByRole("link"))
      expect(link.getAttribute("href")).not.toBe("#");
    expect(
      screen.queryByRole("button", { name: "Subscribe" })
    ).not.toBeInTheDocument();
  });
  it("renders missing images as intentional text stories", () => {
    const { container } = render(
      <StoryCard
        article={{ ...getPublishedArticles()[1], slug: "unillustrated-story" }}
        lead
      />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Sample sea story" })
    ).toHaveAttribute("href", "/weather-ready/unillustrated-story");
  });
  it("explains that demonstration material is not current reporting", () => {
    render(<DemoNote />);
    expect(screen.getByText(SAMPLE_CAUTION)).toBeInTheDocument();
  });
  it("offers useful navigation for an empty topic", async () => {
    render(
      await SectionPage({ params: Promise.resolve({ section: "sport" }) })
    );
    expect(
      screen.getByRole("heading", { name: "No stories in this topic yet." })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore all topics →" })
    ).toHaveAttribute("href", "/topics");
  });
  it("renders selected collection stories", async () => {
    render(
      await CollectionPage({
        params: Promise.resolve({ slug: "weather-and-everyday-life" }),
      })
    );
    expect(
      screen.getByRole("link", { name: "Sample dust story" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sample opportunity" })
    ).not.toBeInTheDocument();
  });
  it.each([
    TopicsPage,
    BriefsPage,
    LearnPage,
    ArchivePage,
    SearchPage,
    AboutPage,
    NotFound,
  ])("gives each discovery page one clear title", (Page) => {
    render(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

it("offers editions, guides and topics from the expanded archive invitation", () => {
  render(<ArchiveInvitation />);
  expect(
    screen.getByRole("link", { name: "Browse past editions →" })
  ).toHaveAttribute("href", "/briefs");
  expect(
    screen.getByRole("link", { name: "Read the guides →" })
  ).toHaveAttribute("href", "/learn");
  expect(
    screen.getByRole("link", { name: "Explore every topic →" })
  ).toHaveAttribute("href", "/topics");
});
