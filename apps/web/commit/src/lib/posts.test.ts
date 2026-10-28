import { describe, expect, it } from "vitest";
import { type PostSummary, publishedPosts } from "@/lib/posts";
import { allPosts } from "../../.content-collections/generated";

const post = (overrides: Partial<PostSummary>): PostSummary => ({
  date: "2026-10-27",
  draft: false,
  slug: "a",
  summary: "Summary",
  title: "Title",
  ...overrides,
});

describe("publishedPosts", () => {
  it("drops drafts and sorts newest first", () => {
    const result = publishedPosts([
      post({ slug: "old", date: "2026-01-01" }),
      post({ slug: "draft", date: "2026-12-01", draft: true }),
      post({ slug: "new", date: "2026-11-01" }),
    ]);
    expect(result.map((p) => p.slug)).toEqual(["new", "old"]);
  });

  it("orders same-day posts by slug", () => {
    const result = publishedPosts([post({ slug: "b" }), post({ slug: "a" })]);
    expect(result.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});

describe("content/posts", () => {
  it("has the 1.0.0 post as a published entry", () => {
    const first = allPosts.find((p) => p.release === "1.0.0");
    expect(first?.slug).toBe("v1-0-0");
    expect(first?.draft).toBe(false);
  });

  it("uses unique release numbers", () => {
    const releases = allPosts.flatMap((p) => (p.release ? [p.release] : []));
    expect(new Set(releases).size).toBe(releases.length);
  });
});
