import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  findNewsletterItems,
  NEWSLETTER_ITEM_LIMIT,
  NEWSLETTER_WINDOW_MS,
  toNewsletterItem,
} from "./newsletter-feed";

const ORIGIN = "https://weather.example.test";
const NOW = new Date("2026-10-29T12:00:00.000Z");

describe("toNewsletterItem", () => {
  it("shapes a story as the digest reads it, linked to its weather-site page", () => {
    expect(
      toNewsletterItem(
        "stories",
        {
          title: " Heavy rain expected ",
          slug: "stories/2026/10/heavy-rain",
          summary: "What to expect",
          publishedAt: "2026-10-29T09:00:00.000Z",
        },
        ORIGIN
      )
    ).toEqual({
      title: "Heavy rain expected",
      url: "https://weather.example.test/explore/news/2026/10/heavy-rain",
      summary: "What to expect",
      includeInNewsletter: true,
      publishedAt: "2026-10-29T09:00:00.000Z",
    });
  });

  it("links a live post to the home page and uses its text as the summary", () => {
    expect(
      toNewsletterItem(
        "live-posts",
        {
          title: "Rain moving in",
          text: "Showers from noon.",
          publishedAt: "2026-10-29T10:00:00.000Z",
        },
        ORIGIN
      )
    ).toMatchObject({
      url: "https://weather.example.test/",
      summary: "Showers from noon.",
    });
  });

  it("skips a post without a publish time or a title", () => {
    expect(
      toNewsletterItem(
        "stories",
        { title: "x", slug: "stories/a", publishedAt: null },
        ORIGIN
      )
    ).toBeNull();
    expect(
      toNewsletterItem(
        "stories",
        {
          title: "   ",
          slug: "stories/a",
          publishedAt: "2026-10-29T10:00:00.000Z",
        },
        ORIGIN
      )
    ).toBeNull();
  });
});

/** A payload whose `find` returns the given docs per collection. */
function fakePayload(docs: Record<string, unknown[]>) {
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: docs[collection] ?? [],
  }));
  return { payload: { find } as unknown as Payload, find };
}

describe("findNewsletterItems", () => {
  it("asks only for ticked, published, recent posts, and keeps live posts to current general updates", async () => {
    const { payload, find } = fakePayload({});
    await findNewsletterItems(payload, { now: NOW, origin: ORIGIN });
    const since = new Date(NOW.getTime() - NEWSLETTER_WINDOW_MS).toISOString();
    const calls = find.mock.calls.map(
      (call) => call[0] as Record<string, unknown>
    );
    expect(calls.map((call) => call.collection)).toEqual([
      "desk-updates",
      "stories",
      "report-notes",
      "live-posts",
    ]);
    const storyWhere = JSON.stringify(calls[1]?.where);
    expect(storyWhere).toContain('"includeInNewsletter":{"equals":true}');
    expect(storyWhere).toContain(`"publishedAt":{"greater_than":"${since}"}`);
    expect(storyWhere).toContain('"status":{"equals":"published"}');
    expect(calls[1]?.overrideAccess).toBe(false);
    const liveWhere = JSON.stringify(calls[3]?.where);
    expect(liveWhere).toContain('"kind":{"equals":"update"}');
    expect(liveWhere).toContain('"expiresAt":{"greater_than"');
    expect(storyWhere).not.toContain('"kind"');
  });

  it("returns items from every section, newest first, and never more than the limit", async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      title: `Story ${index}`,
      slug: `stories/2026/10/s-${index}`,
      summary: "",
      publishedAt: new Date(NOW.getTime() - index * 60_000).toISOString(),
    }));
    const { payload } = fakePayload({
      stories: many,
      "desk-updates": [
        {
          title: "Forecast update",
          slug: "updates/2026/10/forecast",
          summary: "",
          // Newer than every story above, so it must come first.
          publishedAt: new Date(NOW.getTime() + 60_000).toISOString(),
        },
      ],
    });
    const items = await findNewsletterItems(payload, {
      now: NOW,
      origin: ORIGIN,
    });
    expect(items).toHaveLength(NEWSLETTER_ITEM_LIMIT);
    expect(items[0]?.title).toBe("Forecast update");
    expect(items[0]?.url).toBe(
      "https://weather.example.test/explore/updates/2026/10/forecast"
    );
  });
});
