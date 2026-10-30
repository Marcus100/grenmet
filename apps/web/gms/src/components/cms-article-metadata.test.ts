import { describe, expect, it, vi } from "vitest";
import { cmsArticleMetadata } from "@/components/cms-article";
import { fetchContentBySlug, type PublishedContent } from "@/lib/cms";
import { SITE_DESCRIPTION, SITE_LOCALE } from "@/lib/site-metadata";
import { SITE_NAME } from "@/lib/site-name";

vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  return { ...actual, fetchContentBySlug: vi.fn() };
});

const article = (overrides: Partial<PublishedContent> = {}): PublishedContent =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    collection: "stories",
    title: "Why the rain came early",
    slug: "why-the-rain-came-early",
    summary: "A short look at the early rain.",
    body: "Body.",
    imageUrl: null,
    updatedAt: "2026-10-29T12:00:00Z",
    publishedAt: "2026-10-28T12:00:00Z",
    linkedProduct: null,
    ...overrides,
  }) as PublishedContent;

describe("cmsArticleMetadata", () => {
  it("uses the article summary as its description and as the share text", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [article()],
    });
    const metadata = await cmsArticleMetadata("stories/why");
    expect(metadata.title).toBe("Why the rain came early");
    expect(metadata.description).toBe("A short look at the early rain.");
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      title: "Why the rain came early",
      description: "A short look at the early rain.",
      siteName: SITE_NAME,
      publishedTime: "2026-10-28T12:00:00Z",
      modifiedTime: "2026-10-29T12:00:00Z",
    });
  });

  it("falls back to the site description when a post has no summary", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [article({ summary: null })],
    });
    const metadata = await cmsArticleMetadata("stories/why");
    expect(metadata.description).toBe(SITE_DESCRIPTION);
  });

  it("names a missing article generically", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [],
    });
    expect(await cmsArticleMetadata("stories/gone")).toEqual({
      title: "GMS article",
    });
  });

  it("falls back to the site description when the summary is empty", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [article({ summary: "" })],
    });
    const metadata = await cmsArticleMetadata("stories/why");
    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({ description: SITE_DESCRIPTION });
  });

  it("keeps the site locale on article Open Graph, which overrides the root's", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [article()],
    });
    const metadata = await cmsArticleMetadata("stories/why");
    expect(metadata.openGraph).toMatchObject({ locale: SITE_LOCALE });
  });

  it("asks search engines not to index a page that says the article cannot be retrieved", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "unavailable",
      articles: [],
    });
    const metadata = await cmsArticleMetadata("stories/why");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("does not add that instruction when the article is found", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [article()],
    });
    expect((await cmsArticleMetadata("stories/why")).robots).toBeUndefined();
  });
});
