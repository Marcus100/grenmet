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

  it("is null when the CMS cannot answer, and does not keep that", async () => {
    reply(503, {});
    expect(await cmsItemExists(STORY)).toBeNull();
    reply(200, { unexpected: true });
    expect(await cmsItemExists(STORY)).toBeNull();
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY)).toBe(true);
  });

  it("is null without a CMS address, and asks nothing", async () => {
    env.CMS_API_URL = undefined;
    reply(200, { articles: [] });
    expect(await cmsItemExists(STORY)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("keeps a definite answer for a minute, then asks again", async () => {
    reply(200, { articles: [] });
    expect(await cmsItemExists(STORY, 1000)).toBe(false);
    expect(await cmsItemExists(STORY, 1000 + 59_000)).toBe(false);
    expect(asked).toHaveLength(1);
    reply(200, { articles: [{ id: "1" }] });
    expect(await cmsItemExists(STORY, 1000 + CMS_ANSWER_TTL_MS)).toBe(true);
  });
});
