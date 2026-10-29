import { describe, expect, it } from "vitest";
import { isOnSite, liveWhere } from "./publication-window";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const iso = (offsetHours: number) =>
  new Date(NOW.getTime() + offsetHours * 3_600_000).toISOString();

describe("what is on the site", () => {
  it("shows a published item with no window", () => {
    expect(isOnSite({ status: "published" }, NOW)).toBe(true);
  });
  it("never shows a draft or a review copy", () => {
    expect(isOnSite({ status: "draft" }, NOW)).toBe(false);
    expect(isOnSite({ status: "review" }, NOW)).toBe(false);
  });
  it("holds an item back until its show-from time", () => {
    expect(isOnSite({ status: "published", publishAt: iso(1) }, NOW)).toBe(
      false
    );
    expect(isOnSite({ status: "published", publishAt: iso(-1) }, NOW)).toBe(
      true
    );
  });
  it("takes an item off at its take-off time, and not before", () => {
    expect(isOnSite({ status: "published", unpublishAt: iso(-1) }, NOW)).toBe(
      false
    );
    expect(isOnSite({ status: "published", unpublishAt: iso(1) }, NOW)).toBe(
      true
    );
  });
  it("treats an unreadable time as no time", () => {
    expect(
      isOnSite({ status: "published", publishAt: "not a date" }, NOW)
    ).toBe(true);
  });
});

describe("the public query", () => {
  it("requires published status and both windows, plus the caller's conditions", () => {
    const where = liveWhere(NOW, { kind: { equals: "update" } });
    expect(where).toEqual({
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { publishAt: { exists: false } },
            { publishAt: { less_than_equal: NOW.toISOString() } },
          ],
        },
        {
          or: [
            { unpublishAt: { exists: false } },
            { unpublishAt: { greater_than: NOW.toISOString() } },
          ],
        },
        { kind: { equals: "update" } },
      ],
    });
  });
});
