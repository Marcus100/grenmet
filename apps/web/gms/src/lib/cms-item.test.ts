import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { CMS_API_URL: "http://cms.example.test" },
}));

import { contentHref, questionHref } from "@/lib/cms";
import { cmsItemForPath } from "@/lib/cms-item";

describe("cmsItemForPath", () => {
  it("maps every address the site builds back to its CMS slug", () => {
    for (const [collection, slug] of [
      ["stories", "stories/2026/09/a-wet-week"],
      ["desk-updates", "updates/2026/10/30/morning"],
      ["report-notes", "reports/2026/q3"],
    ] as const) {
      expect(cmsItemForPath(contentHref({ collection, slug }))).toEqual({
        endpoint: "articles",
        slug,
      });
    }
    expect(cmsItemForPath(questionHref("questions/why-is-it-windy"))).toEqual({
      endpoint: "questions",
      slug: "questions/why-is-it-windy",
    });
    expect(cmsItemForPath("/explore/quiz/hurricane-basics")).toEqual({
      endpoint: "quizzes",
      slug: "discover/hurricane-basics",
    });
  });

  it("decodes the address as the page's params are decoded", () => {
    expect(cmsItemForPath("/explore/news/caf%C3%A9-week")?.slug).toBe(
      "stories/café-week"
    );
  });

  it("is null for anything that is not one CMS item", () => {
    for (const path of [
      "/explore",
      "/explore/news",
      "/explore/explained/a/b",
      "/explore/quiz/a/b",
      "/explore/today",
      "/weather/news/x",
      "/explore/news/%E0%A4%A",
    ]) {
      expect(cmsItemForPath(path), path).toBeNull();
    }
  });
});
