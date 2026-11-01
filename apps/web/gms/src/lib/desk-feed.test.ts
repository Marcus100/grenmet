import { describe, expect, it } from "vitest";
import type { PublishedContent } from "@/lib/cms";
import { buildDeskFeed, nextForecastDue } from "@/lib/desk-feed";

const product = (
  kind: "morning" | "midday" | "evening" | "outlook",
  publishedAt: string,
  values: Record<string, string>
) => ({
  id: `00000000-0000-4000-8000-0000000000${kind.length}${publishedAt.slice(11, 13)}`,
  revision: 1,
  publishedAt,
  kind,
  values,
});

const post = (id: string, publishedAt: string): PublishedContent => ({
  id,
  collection: "desk-updates",
  title: `Post ${id}`,
  slug: `updates/${id}`,
  summary: null,
  body: "",
  imageUrl: null,
  updatedAt: publishedAt,
  publishedAt,
  linkedProduct: null,
});

const EXPIRED_NOTE = /^Expired .* · next forecast due 6:00 p\.m\.$/;

// 1 Nov 2026, 1:00 p.m. in Grenada.
const NOW = new Date("2026-11-01T17:00:00Z");

describe("buildDeskFeed", () => {
  it("pins the newest public forecast, then the outlook, then posts newest first", () => {
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [
        post("a", "2026-10-30T12:00:00Z"),
        post("b", "2026-11-01T12:00:00Z"),
      ],
      products: [
        product("morning", "2026-11-01T11:00:00Z", {
          issuedAt: "2026-11-01T07:00",
        }),
        product("midday", "2026-11-01T16:00:00Z", {
          issuedAt: "2026-11-01T12:00",
          summary: " Hazy. ",
        }),
        product("outlook", "2026-11-01T12:00:00Z", {
          systems: "A wave near 55W.",
        }),
      ],
    });
    expect(feed.official.map((card) => [card.kind, card.title])).toEqual([
      ["briefing", "Midday Forecast"],
      ["outlook", "Tropical Weather Outlook"],
    ]);
    expect(feed.official[0]?.summary).toBe("Hazy.");
    expect(feed.official[1]?.summary).toBe("A wave near 55W.");
    expect(feed.posts.map((item) => item.id)).toEqual(["b", "a"]);
    expect(feed.collapsePosts).toBe(false);
  });

  it("keeps an expired briefing, marked with the next forecast due", () => {
    const feed = buildDeskFeed({
      level: "none",
      now: new Date("2026-11-03T17:00:00Z"),
      posts: [],
      products: [
        product("midday", "2026-11-01T16:00:00Z", {
          issuedAt: "2026-11-01T12:00",
        }),
      ],
    });
    expect(feed.official[0]?.expiredNote).toMatch(EXPIRED_NOTE);
  });

  it("collapses desk posts only under a red (take action) warning", () => {
    const posts = [post("a", "2026-11-01T12:00:00Z")];
    expect(
      buildDeskFeed({ level: "be-prepared", now: NOW, posts, products: [] })
        .collapsePosts
    ).toBe(false);
    expect(
      buildDeskFeed({ level: "take-action", now: NOW, posts, products: [] })
        .collapsePosts
    ).toBe(true);
  });

  it("shows at most eight posts", () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      post(String(i), `2026-10-2${i % 10}T12:00:00Z`)
    );
    expect(
      buildDeskFeed({ level: "none", now: NOW, posts, products: [] }).posts
    ).toHaveLength(8);
  });
});

describe("nextForecastDue", () => {
  it("names the next scheduled public forecast in Grenada time", () => {
    expect(nextForecastDue(new Date("2026-11-01T10:00:00Z"))).toBe("7:00 a.m."); // 6:00 a.m.
    expect(nextForecastDue(new Date("2026-11-01T17:00:00Z"))).toBe("6:00 p.m."); // 1:00 p.m.
    expect(nextForecastDue(new Date("2026-11-02T01:00:00Z"))).toBe(
      "7:00 a.m. tomorrow"
    ); // 9:00 p.m.
  });
});
