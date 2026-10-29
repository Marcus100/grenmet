import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { CMS_API_URL: "http://cms.example.test" },
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { reportError } from "@/lib/report-error";
import { fetchPreview } from "./cms-preview";

/** A well-formed token shape; the CMS, not this app, decides whether it is genuine. */
const TOKEN = "eyJjIjoic3RvcmllcyIsImkiOiI0MiJ9.c2lnbmF0dXJl";

const draftStory = {
  id: "42",
  collection: "stories",
  title: "Season preparation",
  slug: "stories/2026/10/season-preparation",
  kicker: null,
  summary: "Get ready",
  category: "Grenada weather",
  body: "Plain text.",
  imageUrl: null,
  topics: [],
  publishedAt: null,
  updatedAt: "2026-10-28T00:00:00.000Z",
  relatedLinks: [],
  linkedProduct: null,
};

function cmsReplies(status: number, body: unknown) {
  const fetcher = vi.fn(async () =>
    status === 404 || status >= 500
      ? new Response("{}", { status })
      : Response.json(body, { status })
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(reportError).mockClear();
});

describe("fetchPreview", () => {
  it("returns the draft as published content, asking the CMS with no caching", async () => {
    const fetcher = cmsReplies(200, {
      preview: { collection: "stories", status: "draft", item: draftStory },
    });
    const result = await fetchPreview(TOKEN);
    expect(result).toMatchObject({
      status: "ok",
      draft: true,
      content: { title: "Season preparation", collection: "stories" },
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      `http://cms.example.test/api/public/preview?token=${encodeURIComponent(TOKEN)}`
    );
    expect(init.cache).toBe("no-store");
  });

  it("marks a published item as not a draft", async () => {
    cmsReplies(200, {
      preview: { collection: "stories", status: "published", item: draftStory },
    });
    expect(await fetchPreview(TOKEN)).toMatchObject({
      status: "ok",
      draft: false,
    });
  });

  it("treats a forged or expired token as invalid, because the CMS answers 404", async () => {
    cmsReplies(404, {
      error: "This preview link is not valid or has expired.",
    });
    expect(await fetchPreview(TOKEN)).toEqual({ status: "invalid" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("refuses a token of the wrong shape without asking the CMS", async () => {
    for (const bad of [
      "",
      "no-dot-here",
      "a.b.c",
      "has spaces.sig",
      `${"x".repeat(2001)}.sig`,
    ]) {
      const fetcher = cmsReplies(200, {});
      expect(await fetchPreview(bad)).toEqual({ status: "invalid" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("says unavailable when the CMS fails, without calling the outage a bad link", async () => {
    cmsReplies(503, {});
    expect(await fetchPreview(TOKEN)).toEqual({ status: "unavailable" });
  });

  it("says unavailable and reports when the CMS sends content this site cannot read", async () => {
    cmsReplies(200, {
      preview: { collection: "stories", status: "draft", item: { id: "1" } },
    });
    expect(await fetchPreview(TOKEN)).toEqual({ status: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "gms-cms-preview-contract"
    );
  });

  it("says unsupported for a kind of item the site does not render as a page", async () => {
    cmsReplies(200, {
      preview: { collection: "live-posts", status: "draft", item: { id: "9" } },
    });
    expect(await fetchPreview(TOKEN)).toEqual({ status: "unsupported" });
  });

  it("reports a network failure and answers unavailable", async () => {
    const failure = new Error("connection refused");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(failure))
    );
    expect(await fetchPreview(TOKEN)).toEqual({ status: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(failure, "gms-cms-preview");
  });
});
