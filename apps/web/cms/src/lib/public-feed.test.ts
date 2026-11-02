import { describe, expect, it } from "vitest";
import { DeskUpdates } from "../collections/desk-updates";
import type { EditorialLink } from "./editorial-links";
import { optionLabel, toArticle, toBasedOn, toLivePost } from "./public-feed";

describe("optionLabel", () => {
  it("reads labels from the schema", () => {
    expect(optionLabel(DeskUpdates, "kind", "service-notice")).toBe(
      "Service notice"
    );
    expect(optionLabel(DeskUpdates, "kind", "tropical-outlook")).toBe(
      "Tropical weather outlook"
    );
    // The old values are gone from the list; the migration moved them.
    expect(optionLabel(DeskUpdates, "kind", "public-notice")).toBeNull();
    expect(optionLabel(DeskUpdates, "kind", "unknown")).toBeNull();
    expect(optionLabel(DeskUpdates, "kind", undefined)).toBeNull();
  });
});

describe("live post media", () => {
  const post = (kind: string) =>
    toLivePost({
      id: 1,
      kind,
      title: "Post",
      mediaUrl: "https://youtu.be/abc123",
      updatedAt: "2026-10-28T00:00:00.000Z",
    } as never);
  it("carries a media link only for video and audio", () => {
    expect(post("video").mediaUrl).toBe("https://youtu.be/abc123");
    expect(post("audio").mediaUrl).toBe("https://youtu.be/abc123");
    for (const kind of ["update", "satellite", "radar", "wind", "seas"])
      expect(post(kind).mediaUrl).toBeNull();
  });
});

describe("desk post sharing and placement (owner, 1 Nov 2026)", () => {
  const link = (overrides: Partial<EditorialLink>): EditorialLink => ({
    url: "https://weather.barrels.gd/weather/issued/x",
    type: "product",
    ref: "00000000-0000-4000-8000-000000000001",
    title: "Evening Forecast · issued 2026-10-27 18:00",
    category: "forecast",
    isMain: false,
    ...overrides,
  });

  it("is based on the main product link, else the first product link", () => {
    const main = link({
      isMain: true,
      ref: "11111111-1111-4111-8111-111111111111",
    });
    expect(toBasedOn([link({}), main])?.productId).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(toBasedOn([link({})])?.productId).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("is not based on an outside link or on nothing", () => {
    expect(
      toBasedOn([
        {
          url: "https://example.com/story",
          type: "link",
          ref: null,
          title: "A story",
          category: "source",
          isMain: false,
        },
      ])
    ).toBeNull();
    expect(toBasedOn([])).toBeNull();
  });

  it("shares the general social image first, then the cover", () => {
    const base = {
      id: 1,
      slug: "updates/2026/11/a",
      title: "A",
      summary: "s",
      body: null,
      updatedAt: "2026-11-01T12:00:00Z",
      relatedLinks: [],
      kind: "announcement",
      format: "standard",
    };
    const cover = { url: "/api/media/file/cover.jpg", alt: "c" };
    const social = { url: "/api/media/file/social.jpg", alt: "s" };
    expect(
      toArticle("desk-updates", {
        ...base,
        image: cover,
        social: { image: social },
      }).socialImageUrl
    ).toBe("/api/media/file/social.jpg");
    expect(
      toArticle("desk-updates", { ...base, image: cover, social: {} })
        .socialImageUrl
    ).toBe("/api/media/file/cover.jpg");
  });

  it("exposes pinned only as true; other posts are not pinned", () => {
    const base = {
      id: 1,
      slug: "updates/2026/11/a",
      title: "A",
      summary: "s",
      body: null,
      updatedAt: "2026-11-01T12:00:00Z",
      relatedLinks: [],
      kind: "announcement",
      format: "standard",
    };
    expect(toArticle("desk-updates", { ...base, pinned: true }).pinned).toBe(
      true
    );
    expect(toArticle("desk-updates", base).pinned).toBe(false);
  });
});
