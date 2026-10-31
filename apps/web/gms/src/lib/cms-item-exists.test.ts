// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  CMS_API_URL: "http://cms.example.test" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env }));

import {
  CMS_ANSWER_TTL_MS,
  cmsItemExists,
  forgetCmsAnswers,
} from "@/lib/cms-item-exists";

const STORY = { endpoint: "articles", slug: "stories/2026/09/x" } as const;
let asked: string[] = [];

function reply(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: URL) => {
      asked.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
}

beforeEach(() => {
  asked = [];
  env.CMS_API_URL = "http://cms.example.test";
  forgetCmsAnswers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cmsItemExists", () => {
  it("is true when the CMS lists the item, asking its public endpoint", async () => {
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY)).toBe(true);
    expect(asked[0]).toBe(
      "http://cms.example.test/api/public/articles?slug=stories%2F2026%2F09%2Fx"
    );
  });

  it("is false when the CMS answers with no such item", async () => {
    reply(200, { questions: [] });
    expect(
      await cmsItemExists({ endpoint: "questions", slug: "questions/nope" })
    ).toBe(false);
  });

  it("is null when the CMS cannot answer, and keeps that only five seconds", async () => {
    reply(503, {});
    expect(await cmsItemExists(STORY, 1000)).toBeNull();
    asked = [];
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY, 1000 + 4000)).toBeNull();
    expect(asked).toEqual([]);
    expect(await cmsItemExists(STORY, 1000 + 5000)).toBe(true);
  });

  it("treats an unexpected reply as unknown", async () => {
    reply(200, { unexpected: true });
    expect(await cmsItemExists(STORY)).toBeNull();
  });

  it("is null without a CMS address, and asks nothing", async () => {
    env.CMS_API_URL = undefined;
    reply(200, { articles: [] });
    expect(await cmsItemExists(STORY)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("keeps a found item for a minute", async () => {
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY, 1000)).toBe(true);
    expect(await cmsItemExists(STORY, 1000 + 59_000)).toBe(true);
    expect(asked).toHaveLength(1);
    expect(await cmsItemExists(STORY, 1000 + 60_000)).toBe(true);
    expect(asked).toHaveLength(2);
  });

  it("keeps a missing item only ten seconds, so a new item shows quickly", async () => {
    reply(200, { articles: [] });
    expect(await cmsItemExists(STORY, 1000)).toBe(false);
    expect(await cmsItemExists(STORY, 1000 + 9000)).toBe(false);
    expect(asked).toHaveLength(1);
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY, 1000 + 10_000)).toBe(true);
  });

  it("refreshing a kept answer when full drops no other live answer", async () => {
    reply(200, { articles: [{ id: "1" }] });
    const item = (slug: string) => ({ endpoint: "articles", slug }) as const;
    await cmsItemExists(item("first"), 0);
    for (let index = 1; index < 500; index += 1) {
      await cmsItemExists(item(`story-${index}`), 0);
    }
    await cmsItemExists(item("story-250"), CMS_ANSWER_TTL_MS.exists);
    asked = [];
    await cmsItemExists(item("first"), CMS_ANSWER_TTL_MS.exists - 1);
    expect(asked).toEqual([]);
  });
});
