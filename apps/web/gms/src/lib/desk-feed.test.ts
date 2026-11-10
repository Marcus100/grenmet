import { describe, expect, it } from "vitest";
import type { PublishedContent } from "@/lib/cms";
import {
  buildDeskFeed,
  nextForecastDue,
  nextIssueLabel,
} from "@/lib/desk-feed";

const product = (
  kind:
    | "morning"
    | "midday"
    | "evening"
    | "outlook"
    | "marine-forecast"
    | "climate-bulletin",
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

// 1 Nov 2026, 1:00 p.m. in Grenada.
const NOW = new Date("2026-11-01T17:00:00Z");
const EXPIRED_BRIEFING_NOTE = /^Expired .+ · next forecast due 6:00 p\.m\.$/u;
const MARINE_EXPIRED_NOTE =
  /^Expired .+ · next forecast due 5:00 a\.m\. tomorrow$/u;

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
    expect(feed.earlierPosts).toEqual([]);
  });

  it("says an expired briefing expired and when the next forecast is due", () => {
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
    expect(feed.official[0]?.title).toBe("Midday Forecast");
    expect(feed.official[0]?.staleNote).toMatch(EXPIRED_BRIEFING_NOTE);
    expect(feed.official[0]?.staleNote).not.toContain("No longer in effect");
    // The card stays, so the missing-forecast note does not repeat it.
    expect(feed.missingBriefing).toBeNull();
  });

  it("gives an expired Marine Forecast its own next issue (05:00), not the land times", () => {
    const stale = buildDeskFeed({
      level: "none",
      now: new Date("2026-11-03T17:00:00Z"),
      posts: [],
      products: [
        product("marine-forecast", "2026-11-01T09:00:00Z", {
          issuedAt: "2026-11-01T05:00",
          validFrom: "2026-11-01T05:00",
          validTo: "2026-11-02T05:00",
        }),
      ],
    });
    expect(stale.official[0]?.staleNote).toMatch(MARINE_EXPIRED_NOTE);
  });

  it("keeps the not-current note for an outlook, should the API send one", () => {
    const stale = buildDeskFeed({
      level: "none",
      now: new Date("2026-11-03T17:00:00Z"),
      posts: [],
      products: [
        product("outlook", "2026-11-01T12:00:00Z", {
          issuedAt: "2026-11-01T08:00",
          validTo: "2026-11-02T08:00",
        }),
      ],
    });
    expect(stale.official[0]?.staleNote).toBe("No longer in effect");
  });

  it("says when no public forecast is in effect, but only when the feed answered", () => {
    const outlookOnly = [
      product("outlook", "2026-11-01T12:00:00Z", { systems: "A wave." }),
    ];
    expect(
      buildDeskFeed({
        level: "none",
        now: NOW,
        posts: [],
        products: outlookOnly,
      }).missingBriefing
    ).toBe(
      "No public forecast is in effect right now. The next forecast is due 6:00 p.m."
    );
    expect(
      buildDeskFeed({
        level: "none",
        now: NOW,
        posts: [],
        products: [],
        productsAvailable: false,
      }).missingBriefing
    ).toBeNull();
  });

  it("pins the forecast with the latest issue time, not the latest re-save", () => {
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [],
      products: [
        // The morning forecast re-saved after midday was issued.
        product("morning", "2026-11-01T16:30:00Z", {
          issuedAt: "2026-11-01T07:00",
        }),
        product("midday", "2026-11-01T16:00:00Z", {
          issuedAt: "2026-11-01T12:00",
        }),
      ],
    });
    expect(feed.official[0]?.title).toBe("Midday Forecast");
  });

  it("puts pinned posts after the official cards, newest pinned first", () => {
    const pinned = (id: string, publishedAt: string) => ({
      ...post(id, publishedAt),
      pinned: true,
    });
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [
        post("newest", "2026-11-01T12:00:00Z"),
        pinned("older-pin", "2026-10-30T12:00:00Z"),
        pinned("newer-pin", "2026-10-31T12:00:00Z"),
      ],
      products: [
        product("morning", "2026-11-01T11:00:00Z", {
          issuedAt: "2026-11-01T07:00",
        }),
      ],
    });
    expect(feed.official.map((card) => card.kind)).toEqual(["briefing"]);
    expect(feed.posts.map((item) => item.id)).toEqual([
      "newer-pin",
      "older-pin",
      "newest",
    ]);
  });

  it("leads with at most three pinned posts; extra pins sort by date", () => {
    const pinned = (id: string, publishedAt: string) => ({
      ...post(id, publishedAt),
      pinned: true,
    });
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [
        post("u1", "2026-11-05T12:00:00Z"),
        pinned("p1", "2026-11-04T12:00:00Z"),
        pinned("p2", "2026-11-03T12:00:00Z"),
        pinned("p3", "2026-11-02T12:00:00Z"),
        pinned("p4", "2026-11-01T12:00:00Z"),
        post("u2", "2026-10-31T12:00:00Z"),
      ],
      products: [],
    });
    expect(feed.posts.map((item) => item.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "u1",
      "p4",
      "u2",
    ]);
  });

  it("keeps pinned posts inside the eight shown", () => {
    const others = Array.from({ length: 9 }, (_, i) =>
      post(`other-${i}`, `2026-11-01T0${i % 9}:00:00Z`)
    );
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [
        ...others,
        { ...post("old-pin", "2026-10-01T12:00:00Z"), pinned: true },
      ],
      products: [],
    });
    expect(feed.posts).toHaveLength(8);
    expect(feed.posts[0]?.id).toBe("old-pin");
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

describe("red warning split of desk posts", () => {
  // The red warning was issued at 1 Nov 2026, 8:00 a.m. in Grenada.
  const WARNING_ISSUED = Date.parse("2026-11-01T12:00:00Z");
  const older = post("older", "2026-11-01T06:00:00Z");
  const newer = post("newer", "2026-11-01T14:00:00Z");

  it("keeps posts older than the red warning behind Earlier posts, newer ones visible", () => {
    const feed = buildDeskFeed({
      level: "take-action",
      now: NOW,
      posts: [older, newer],
      products: [],
      warningIssuedAt: WARNING_ISSUED,
    });
    expect(feed.posts.map((item) => item.id)).toEqual(["newer"]);
    expect(feed.earlierPosts.map((item) => item.id)).toEqual(["older"]);
  });

  it("puts every post behind Earlier posts when the warning's issue time is unknown", () => {
    const feed = buildDeskFeed({
      level: "take-action",
      now: NOW,
      posts: [older, newer],
      products: [],
      warningIssuedAt: null,
    });
    expect(feed.posts).toEqual([]);
    expect(feed.earlierPosts.map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("splits nothing under a lesser warning, even with an issue time", () => {
    for (const level of ["be-prepared", "be-aware", "none"] as const) {
      const feed = buildDeskFeed({
        level,
        now: NOW,
        posts: [older, newer],
        products: [],
        warningIssuedAt: WARNING_ISSUED,
      });
      expect(feed.earlierPosts).toEqual([]);
      expect(feed.posts).toHaveLength(2);
    }
  });

  it("treats a post published at the warning's issue time as newer, so it stays visible", () => {
    const same = post("same", "2026-11-01T12:00:00Z");
    const feed = buildDeskFeed({
      level: "take-action",
      now: NOW,
      posts: [same],
      products: [],
      warningIssuedAt: WARNING_ISSUED,
    });
    expect(feed.posts.map((item) => item.id)).toEqual(["same"]);
    expect(feed.earlierPosts).toEqual([]);
  });

  it("still lists the official cards first under a red warning", () => {
    const feed = buildDeskFeed({
      level: "take-action",
      now: NOW,
      posts: [newer],
      products: [
        product("morning", "2026-11-01T11:00:00Z", {
          issuedAt: "2026-11-01T07:00",
        }),
      ],
      warningIssuedAt: WARNING_ISSUED,
    });
    expect(feed.official.map((card) => card.kind)).toEqual(["briefing"]);
    expect(feed.posts.map((item) => item.id)).toEqual(["newer"]);
  });
});

describe("official card pictures", () => {
  const midday = product("midday", "2026-11-01T16:00:00Z", {
    issuedAt: "2026-11-01T12:00",
  });
  const basedOnMidday = {
    productId: midday.id,
    title: "Midday Forecast",
  };
  const pinnedPicture: PublishedContent = {
    ...post("pic", "2026-11-01T13:00:00Z"),
    pinned: true,
    basedOn: basedOnMidday,
    imageUrl: "https://cms.example/media/rain-map.png",
    imageAlt: "Rain map for the afternoon",
    imageCredit: "Photo: Kendra Mitchell",
  };
  const briefingPicture = (posts: PublishedContent[]) =>
    buildDeskFeed({
      level: "none",
      now: NOW,
      posts,
      products: [midday],
    }).official[0]?.picture;

  it("takes the picture of the pinned desk post based on the product", () => {
    expect(briefingPicture([pinnedPicture])).toEqual({
      src: "https://cms.example/media/rain-map.png",
      alt: "Rain map for the afternoon",
      credit: "Photo: Kendra Mitchell",
    });
  });

  it("credits a picture with no credit to GMS", () => {
    expect(
      briefingPicture([{ ...pinnedPicture, imageCredit: null }])?.credit
    ).toBe("Photo: GMS");
  });

  it("leaves the picture empty when no pinned desk post is based on the product", () => {
    expect(briefingPicture([{ ...pinnedPicture, pinned: false }])).toBeNull();
    expect(briefingPicture([{ ...pinnedPicture, basedOn: null }])).toBeNull();
    expect(
      briefingPicture([
        { ...pinnedPicture, basedOn: { productId: "other", title: null } },
      ])
    ).toBeNull();
    expect(briefingPicture([{ ...pinnedPicture, imageUrl: null }])).toBeNull();
  });

  it("uses desk posts only, not report write-ups", () => {
    expect(
      briefingPicture([{ ...pinnedPicture, collection: "report-notes" }])
    ).toBeNull();
  });

  it("uses the newest matching pinned post", () => {
    const older = {
      ...pinnedPicture,
      id: "older",
      publishedAt: "2026-11-01T09:00:00Z",
      imageUrl: "https://cms.example/media/older.png",
    };
    expect(briefingPicture([older, pinnedPicture])?.src).toBe(
      "https://cms.example/media/rain-map.png"
    );
  });
});

describe("nextForecastDue", () => {
  it("names the next scheduled public forecast in Grenada time", () => {
    expect(nextForecastDue(new Date("2026-11-01T10:00:00Z"))).toBe("7:00 a.m."); // 6:00 a.m.
    expect(nextForecastDue(new Date("2026-11-01T17:00:00Z"))).toBe("6:00 p.m."); // 1:00 p.m.
    // 7:30 a.m.: the 7:00 forecast is being prepared.
    expect(nextForecastDue(new Date("2026-11-01T11:30:00Z"))).toBe(
      "now (the 7:00 a.m. forecast)"
    );
    expect(nextForecastDue(new Date("2026-11-02T01:00:00Z"))).toBe(
      "7:00 a.m. tomorrow"
    ); // 9:00 p.m.
  });
});

describe("Marine Forecast and Climate Bulletin cards", () => {
  const marine = product("marine-forecast", "2026-11-01T09:00:00Z", {
    issuedAt: "2026-11-01T05:00",
    validFrom: "2026-11-01T05:00",
    validTo: "2026-11-02T05:00",
    synopsis: "Moderate trades. ",
  });
  const climate = product("climate-bulletin", "2026-10-15T14:00:00Z", {
    issuedAt: "2026-10-15T10:00",
    validFrom: "2026-10-15T10:00",
    validTo: "2026-11-15T23:59",
    precipOutlook: "Rainfall totals for the next quarter are uncertain.",
    droughtOutlook: "A drought watch is in effect.",
  });

  it("lists the Marine Forecast after the briefing, then the outlook, then the climate bulletin", () => {
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [],
      products: [
        climate,
        product("outlook", "2026-11-01T12:00:00Z", { systems: "A wave." }),
        marine,
        product("morning", "2026-11-01T11:00:00Z", {
          issuedAt: "2026-11-01T07:00",
        }),
      ],
    });
    expect(feed.official.map((card) => [card.kind, card.title])).toEqual([
      ["briefing", "Morning Forecast"],
      ["marine", "Marine Forecast"],
      ["outlook", "Tropical Weather Outlook"],
      ["climate", "Climate Bulletin"],
    ]);
  });

  it("adds the Marine Forecast and Climate Bulletin cards with their own wording", () => {
    const feed = buildDeskFeed({
      level: "none",
      now: NOW,
      posts: [],
      products: [marine, climate],
    });
    expect(feed.official.map((card) => [card.kind, card.title])).toEqual([
      ["marine", "Marine Forecast"],
      ["climate", "Climate Bulletin"],
    ]);
    expect(feed.official[0]?.summary).toBe("Moderate trades.");
    expect(feed.official[1]?.summary).toBe(
      "Rainfall totals for the next quarter are uncertain."
    );
    expect(feed.official[1]?.valid).toBe("Next issue 15 November");
    expect(feed.official[1]?.staleNote).toBeNull();
  });

  it("names the next 15th after the issue day", () => {
    expect(nextIssueLabel("2026-12-15T10:00")).toBe("Next issue 15 January");
    expect(nextIssueLabel("2026-11-10T10:00")).toBe(
      "Issued outside the monthly schedule"
    );
    expect(nextIssueLabel(undefined)).toBe("");
  });
});
