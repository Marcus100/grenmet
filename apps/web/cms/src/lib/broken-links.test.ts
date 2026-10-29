import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEditor } from "../access";
import { brokenLinksEndpoint, findBrokenLinks } from "./broken-links";

const BASE = "http://api.test";
const WITHDRAWN = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const CURRENT = "9a8b7c6d-1111-4a2b-9c3d-555566667777";

/** Documents by collection, as the CMS would hold them. */
function payloadWith(docs: Record<string, Record<string, unknown>[]>) {
  const find = vi.fn(({ collection }: { collection: string }) =>
    Promise.resolve({ docs: docs[collection] ?? [] })
  );
  return { find } as never;
}

/** The forecast system: withdrawn product 404s, the current one answers. */
function feed(url: string | URL) {
  const address = String(url);
  if (address.includes(WITHDRAWN))
    return Promise.resolve({ ok: false, status: 404, json: () => null });
  if (address.includes(CURRENT))
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ kind: "evening", values: {} }),
    });
  if (address.includes("/alerts/GMS-GONE"))
    return Promise.resolve({ ok: false, status: 404, json: () => null });
  return Promise.reject(new Error("offline"));
}

const link = (url: string, extra: Record<string, unknown> = {}) => ({
  url,
  title: "Read",
  category: "forecast",
  isMain: false,
  ...extra,
});

describe("broken link report", () => {
  it("lists only the links that lead nowhere, with the item they sit on", async () => {
    const payload = payloadWith({
      stories: [
        {
          id: 3,
          title: "Storm story",
          slug: "stories/2026/10/storm",
          status: "published",
          relatedLinks: [
            link(`/weather/issued/${WITHDRAWN}`),
            link(`/weather/issued/${CURRENT}`),
          ],
        },
      ],
      "live-posts": [
        {
          id: 9,
          title: "Watch note",
          status: "draft",
          relatedLinks: [link("/alerts/GMS-GONE", { category: "cap" })],
        },
      ],
      questions: [
        {
          id: 4,
          question: "Why is it humid?",
          slug: "questions/why-humid",
          status: "published",
          relatedLinks: [
            link("/weather/no-such-page", { category: "article" }),
          ],
        },
      ],
    });
    const report = await findBrokenLinks(payload, {
      baseURL: BASE,
      fetcher: feed as never,
      now: new Date("2026-10-29T12:00:00.000Z"),
    });
    expect(report.checkedAt).toBe("2026-10-29T12:00:00.000Z");
    expect(report.broken).toEqual([
      {
        collection: "stories",
        documentId: "3",
        status: "published",
        title: "Storm story",
        reason: "The weather product is withdrawn or was never issued.",
        type: "product",
        url: `/weather/issued/${WITHDRAWN}`,
      },
      {
        collection: "questions",
        documentId: "4",
        status: "published",
        title: "Why is it humid?",
        reason: "The GMS page no longer exists.",
        type: "page",
        url: "/weather/no-such-page",
      },
      {
        collection: "live-posts",
        documentId: "9",
        status: "draft",
        title: "Watch note",
        reason: "The warning is withdrawn or is not published.",
        type: "cap",
        url: "/alerts/GMS-GONE",
      },
    ]);
  });

  it("counts a destination it could not reach as unreachable, not broken", async () => {
    const payload = payloadWith({
      stories: [
        {
          id: 1,
          title: "Story",
          status: "published",
          relatedLinks: [link("/alerts/GMS-UNKNOWN", { category: "cap" })],
        },
      ],
    });
    const report = await findBrokenLinks(payload, {
      baseURL: BASE,
      fetcher: feed as never,
    });
    expect(report.broken).toEqual([]);
    expect(report.unreachable).toBe(1);
  });

  it("asks each destination once, however many items link to it", async () => {
    const fetcher = vi.fn(feed);
    const payload = payloadWith({
      stories: [
        {
          id: 1,
          title: "A",
          status: "published",
          relatedLinks: [link(`/weather/issued/${WITHDRAWN}`)],
        },
        {
          id: 2,
          title: "B",
          status: "published",
          relatedLinks: [link(`/weather/issued/${WITHDRAWN}`)],
        },
      ],
    });
    const report = await findBrokenLinks(payload, {
      baseURL: BASE,
      fetcher: fetcher as never,
    });
    expect(report.broken).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(report.checked).toBe(1);
  });

  it("ignores outside links and items with no links", async () => {
    const fetcher = vi.fn(feed);
    const payload = payloadWith({
      stories: [
        {
          id: 1,
          title: "Outside only",
          status: "published",
          relatedLinks: [
            link("https://example.test/report", { category: "source" }),
          ],
        },
        { id: 2, title: "None", status: "published", relatedLinks: [] },
      ],
    });
    const report = await findBrokenLinks(payload, {
      baseURL: BASE,
      fetcher: fetcher as never,
    });
    expect(report).toMatchObject({ broken: [], checked: 0, unreachable: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("broken link endpoint", () => {
  beforeEach(() => {
    vi.stubEnv(
      "PAYLOAD_SECRET",
      "cms-test-only-secret-with-at-least-32-characters"
    );
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://cms:unused@localhost:5432/gms_cms"
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is for editors only", async () => {
    const response = await brokenLinksEndpoint({
      user: { id: 1, permissionKeys: ["cms.article.create"] },
      payload: payloadWith({}),
    } as never);
    expect(response.status).toBe(403);
    expect(isEditor({ id: 1, permissionKeys: ["cms.article.create"] })).toBe(
      false
    );
  });
  it("answers an editor with the report, never cached", async () => {
    const response = await brokenLinksEndpoint({
      user: { id: 2, permissionKeys: ["cms.article.edit.all"] },
      payload: payloadWith({}),
    } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ broken: [], checked: 0 });
  });
});
