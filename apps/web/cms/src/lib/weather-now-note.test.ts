import { describe, expect, it, vi } from "vitest";
import { findWeatherNow } from "./public-feed";

const NOW = new Date("2026-10-29T12:00:00.000Z");

const note = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  kind: "note",
  title: "Duty forecaster's note",
  text: "Showers ease this afternoon.",
  status: "published",
  publishedAt: "2026-10-29T11:30:00.000Z",
  expiresAt: "2026-10-29T16:00:00.000Z",
  relatedLinks: [],
  updatedAt: "2026-10-29T11:30:00.000Z",
  ...overrides,
});

describe("the duty forecaster's note in the public feed", () => {
  it("reads the newest note that is on the site and unexpired", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [note()] });
    const result = await findWeatherNow({ find } as never, NOW);
    expect(result.note).toEqual({
      text: "Showers ease this afternoon.",
      postedAt: "2026-10-29T11:30:00.000Z",
      expiresAt: "2026-10-29T16:00:00.000Z",
      alertUrl: null,
      relatedLinks: [],
    });
    const query = find.mock.calls[0]?.[0] as {
      collection: string;
      overrideAccess: boolean;
      sort: string;
      where: { and: Record<string, unknown>[] };
    };
    expect(query).toMatchObject({
      collection: "live-posts",
      overrideAccess: false,
      sort: "-publishedAt",
    });
    expect(query.where.and).toEqual(
      expect.arrayContaining([
        { status: { equals: "published" } },
        expect.objectContaining({ kind: { equals: "note" } }),
      ])
    );
    // A note with no expiry never shows, as it did before.
    expect(query.where.and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expiresAt: { greater_than: NOW.toISOString() },
        }),
      ])
    );
  });

  it("keeps the CAP alert address as alertUrl for site builds that predate related links", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        note({
          relatedLinks: [
            {
              title: "CAP alert",
              category: "cap",
              url: "https://weather.barrels.gd/alerts/GMS-1",
              isMain: true,
            },
          ],
        }),
      ],
    });
    const result = await findWeatherNow({ find } as never, NOW);
    expect(result.note?.alertUrl).toBe(
      "https://weather.barrels.gd/alerts/GMS-1"
    );
    expect(result.note?.relatedLinks).toHaveLength(1);
  });

  it("is empty when no note is on the site", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    expect(await findWeatherNow({ find } as never, NOW)).toEqual({
      note: null,
    });
  });

  it("is empty for a note with no words", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [note({ text: "  " })] });
    expect(await findWeatherNow({ find } as never, NOW)).toEqual({
      note: null,
    });
  });
});
