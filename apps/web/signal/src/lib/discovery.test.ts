import { describe, expect, it } from "vitest";
import { COLLECTIONS, searchEntries, selectStories } from "./discovery";
import { SECTIONS } from "./nav";

describe("reader discovery", () => {
  it("keeps seven coverage areas and legacy section paths", () => {
    expect(SECTIONS).toHaveLength(7);
    expect(SECTIONS.map((item) => item.slug)).toEqual(
      expect.arrayContaining(["weather-ready", "check-d-ting", "opportunity"])
    );
  });
  it("preserves editorial order and filters drafts and missing selections", () => {
    const stories = [
      {
        section: "weather-ready",
        slug: "saharan-dust",
        draft: false,
        publishedAt: "2026-06-13",
      },
      {
        section: "weather-ready",
        slug: "small-craft-advisory",
        draft: true,
        publishedAt: "2026-06-12",
      },
    ];
    expect(selectStories(stories, COLLECTIONS[1].paths)).toEqual([stories[0]]);
    expect(selectStories(stories, ["missing/story"])).toEqual([]);
  });
  it("matches all search words without treating the query as a regular expression", () => {
    const entries = [
      {
        href: "/weather-ready/dust",
        title: "Saharan dust",
        description: "Hazy skies",
        label: "Weather & Environment",
      },
    ];
    expect(searchEntries(entries, " DUST weather ")).toEqual(entries);
    expect(searchEntries(entries, "dust scholarship")).toEqual([]);
    expect(searchEntries(entries, "[")).toEqual([]);
    expect(searchEntries(entries, "  ")).toEqual([]);
  });
});
