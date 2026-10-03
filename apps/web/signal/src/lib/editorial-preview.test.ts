import { expect, it } from "vitest";
import {
  getArticle,
  getArticlesBySection,
  getCurrentArticles,
  getLatestBrief,
  getPublishedArticles,
} from "./content";
import { COLLECTIONS, HOME_LEAD_PATHS, selectStories } from "./discovery";

it("provides sixteen attributed editorial previews without inventing Signal bylines", () => {
  const stories = getCurrentArticles();
  expect(stories).toHaveLength(16);
  for (const story of stories) {
    expect(story.reviewStatus).toBe("editorial-preview");
    expect(story.author.startsWith("Source:")).toBe(true);
    expect(story.sources.length).toBeGreaterThan(0);
    expect(
      story.sources.every((source) => source.url.startsWith("https://"))
    ).toBe(true);
    expect(story.body.length).toBeGreaterThan(0);
    expect(story.publishedAt).toBe("2026-10-03");
  }
});

it("curates the lead and October collection and keeps the sample URLs available", () => {
  expect(
    selectStories(getCurrentArticles(), HOME_LEAD_PATHS).map(
      (story) => `${story.section}/${story.slug}`
    )
  ).toEqual(HOME_LEAD_PATHS);
  expect(
    selectStories(getCurrentArticles(), COLLECTIONS[0].paths)
  ).toHaveLength(3);
  expect(getLatestBrief()?.date).toBe("2026-10-03");
  expect(getLatestBrief()?.reviewStatus).toBe("editorial-preview");
  expect(getArticle("weather-ready", "saharan-dust")?.reviewStatus).toBe(
    "sample"
  );
  expect(getPublishedArticles()).toHaveLength(22);
  expect(
    getArticlesBySection("weather-ready").map((story) => story.slug)
  ).toEqual(
    expect.arrayContaining([
      "dive-conservation-festival-2026",
      "grenada-glass-recycling-2026",
    ])
  );
});

it("gives every topic distinct coverage beyond the main selections", () => {
  const featured = new Set([
    ...HOME_LEAD_PATHS,
    ...COLLECTIONS[0].paths.slice(0, 2),
  ]);
  for (const section of [
    "news-community",
    "opportunity",
    "culture-life",
    "sport",
    "weather-ready",
    "check-d-ting",
    "grenada-world",
  ]) {
    expect(
      getArticlesBySection(section).some(
        (story) => !featured.has(`${story.section}/${story.slug}`)
      )
    ).toBe(true);
  }
});
