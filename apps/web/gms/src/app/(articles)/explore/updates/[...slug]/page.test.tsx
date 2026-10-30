import { describe, expect, it, vi } from "vitest";
import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { contentSlug } from "@/lib/cms";
import UpdatePage, { generateMetadata } from "./page";

vi.mock("@/components/cms-article", () => ({
  CmsArticle: vi.fn(() => "cms-article"),
  cmsArticleMetadata: vi.fn(async () => ({ title: "From the CMS" })),
}));

const params = (slug: string[]) => Promise.resolve({ slug });

describe("/explore/updates/[...slug]", () => {
  it("serves only published CMS posts, even for a sample post's old URL", async () => {
    const result = await UpdatePage({
      params: params(["evening-2026-09-08"]),
    });
    expect(result).toBe("cms-article");
    expect(CmsArticle).toHaveBeenCalledWith({
      slug: contentSlug("desk-updates", ["evening-2026-09-08"]),
    });
  });

  it("takes its metadata from the CMS article", async () => {
    await generateMetadata({ params: params(["2026", "09", "a-post"]) });
    expect(cmsArticleMetadata).toHaveBeenCalledWith(
      contentSlug("desk-updates", ["2026", "09", "a-post"])
    );
  });
});
