import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  AUTH_API_URL: "http://api.example.test",
  CMS_URL: "http://cms.example.test",
  CMS_DISTRIBUTION_SECRET: "distribution-test-secret-at-least-32-chars",
  GMS_SITE_URL: "https://weather.example.test",
}));
vi.mock("../env", () => ({ getEnv: () => env }));
vi.mock("./report-error", () => ({ reportError: vi.fn() }));

import { reportError } from "./report-error";
import {
  distributeApprovedPost,
  distributionBody,
  sendDistribution,
} from "./social-distribution";

const ENDPOINT =
  "http://api.example.test/api/v1/content-distribution/internal/posts";

const SOCIAL = {
  approveForSocial: true,
  enabledPlatforms: ["Facebook", "Instagram", "WhatsApp Channel"],
  facebookText: "  Rain builds tonight.  ",
  instagramText: "",
  whatsappText: "Read more on the weather site.",
  publishAt: "2026-10-30T11:00:00.000Z",
  image: null,
};

/** A published, approved story; `social` overrides merge into the defaults. */
const approved = ({
  social,
  ...rest
}: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 7,
  status: "published",
  title: "Heavy rain expected",
  slug: "stories/2026/10/heavy-rain",
  summary: "What to expect this week",
  image: null,
  ...rest,
  social: { ...SOCIAL, ...((social as Record<string, unknown>) ?? {}) },
});

const okResponse = () => new Response(null, { status: 202 });
const fakeFetch = (response: () => Response | Promise<Response>) =>
  vi.fn(async () => response()) as unknown as typeof fetch;

beforeEach(() => {
  env.CMS_DISTRIBUTION_SECRET = "distribution-test-secret-at-least-32-chars";
  env.GMS_SITE_URL = "https://weather.example.test";
  vi.mocked(reportError).mockClear();
});

describe("distributionBody", () => {
  it("builds the agreed payload with the site address and supported platforms only", () => {
    const body = distributionBody({
      collection: "stories",
      doc: approved({
        social: {
          enabledPlatforms: ["X", "Facebook", "Instagram", "WhatsApp Channel"],
        },
      }),
      imageUrl: "http://cms.example.test/media/a.jpg",
      origin: "https://weather.example.test/",
    });
    expect(body).toEqual({
      collection: "stories",
      slug: "stories/2026/10/heavy-rain",
      url: "https://weather.example.test/explore/news/2026/10/heavy-rain",
      title: "Heavy rain expected",
      summary: "What to expect this week",
      captions: {
        facebook: "Rain builds tonight.",
        instagram: null,
        whatsapp: "Read more on the weather site.",
      },
      platforms: ["facebook", "instagram", "whatsapp"],
      publishAt: "2026-10-30T11:00:00.000Z",
      imageUrl: "http://cms.example.test/media/a.jpg",
    });
  });

  it("sends nothing when no supported platform is chosen", () => {
    expect(
      distributionBody({
        collection: "stories",
        doc: approved({ social: { enabledPlatforms: ["X", "LinkedIn"] } }),
        imageUrl: null,
        origin: "https://weather.example.test",
      })
    ).toBeNull();
  });
});

describe("sendDistribution", () => {
  it("posts JSON with the shared secret header to the content-distribution endpoint", async () => {
    const fetchImpl = fakeFetch(okResponse);
    const body = distributionBody({
      collection: "desk-updates",
      doc: approved({ slug: "updates/2026/10/x" }),
      imageUrl: null,
      origin: "https://weather.example.test",
    });
    if (!body) throw new Error("expected a body");
    await sendDistribution(body, {
      apiUrl: "http://api.example.test/",
      fetchImpl,
      secret: "distribution-test-secret-at-least-32-chars",
    });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-cms-secret")).toBe(
      "distribution-test-secret-at-least-32-chars"
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      collection: "desk-updates",
      slug: "updates/2026/10/x",
    });
  });

  it("throws when FastAPI refuses the post", async () => {
    await expect(
      sendDistribution(
        {
          collection: "stories",
          slug: "stories/x",
          url: "https://weather.example.test/explore/news/x",
          title: "t",
          summary: "s",
          captions: { facebook: null, instagram: null, whatsapp: null },
          platforms: ["facebook"],
          publishAt: null,
          imageUrl: null,
        },
        {
          apiUrl: "http://api.example.test",
          fetchImpl: fakeFetch(() => new Response("no", { status: 403 })),
          secret: "distribution-test-secret-at-least-32-chars",
        }
      )
    ).rejects.toThrow("status 403");
  });
});

describe("distributeApprovedPost (the afterChange hook's decision)", () => {
  it("sends an approved, published post once", async () => {
    const fetchImpl = fakeFetch(okResponse);
    const result = await distributeApprovedPost({
      doc: approved(),
      fetchImpl,
      lookupImage: () => Promise.resolve(null),
      slug: "stories",
    });
    expect(result).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the secret is unset, without reading the network", async () => {
    env.CMS_DISTRIBUTION_SECRET = undefined as unknown as string;
    const fetchImpl = fakeFetch(okResponse);
    const result = await distributeApprovedPost({
      doc: approved(),
      fetchImpl,
      slug: "stories",
    });
    expect(result).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does nothing without the weather site's address", async () => {
    env.GMS_SITE_URL = undefined as unknown as string;
    const fetchImpl = fakeFetch(okResponse);
    await distributeApprovedPost({
      doc: approved(),
      fetchImpl,
      slug: "stories",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends nothing unless a publisher approved the post", async () => {
    const fetchImpl = fakeFetch(okResponse);
    const doc = approved({ social: { approveForSocial: false } });
    await distributeApprovedPost({ doc, fetchImpl, slug: "stories" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends nothing for a draft or a review copy", async () => {
    const fetchImpl = fakeFetch(okResponse);
    await distributeApprovedPost({
      doc: approved({ status: "review" }),
      fetchImpl,
      slug: "stories",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends nothing for a collection without a public page", async () => {
    const fetchImpl = fakeFetch(okResponse);
    await distributeApprovedPost({
      doc: approved(),
      fetchImpl,
      slug: "questions",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a failed request and does not throw, so publishing is never blocked", async () => {
    const failure = new Error("connection refused");
    const fetchImpl = vi.fn(() =>
      Promise.reject(failure)
    ) as unknown as typeof fetch;
    await expect(
      distributeApprovedPost({ doc: approved(), fetchImpl, slug: "stories" })
    ).resolves.toBe("skipped");
    expect(reportError).toHaveBeenCalledWith(
      failure,
      "cms-social-distribution"
    );
  });

  it("reports a refused request (non-2xx) and does not throw", async () => {
    const fetchImpl = fakeFetch(() => new Response("bad", { status: 500 }));
    await expect(
      distributeApprovedPost({ doc: approved(), fetchImpl, slug: "stories" })
    ).resolves.toBe("skipped");
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("500") }),
      "cms-social-distribution"
    );
  });

  it("re-saving the same post sends the same body, so the API's key dedupes it", async () => {
    const fetchImpl = fakeFetch(okResponse);
    const doc = approved();
    await distributeApprovedPost({
      doc,
      fetchImpl,
      lookupImage: () => Promise.resolve(null),
      slug: "stories",
    });
    await distributeApprovedPost({
      doc,
      fetchImpl,
      lookupImage: () => Promise.resolve(null),
      slug: "stories",
    });
    const bodies = vi
      .mocked(fetchImpl)
      .mock.calls.map(
        (call) => (call as unknown as [string, RequestInit])[1].body
      );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("uses the custom social image first, then the cover image", async () => {
    const seen: unknown[] = [];
    const lookupImage = (id: unknown) => {
      seen.push(id);
      return Promise.resolve(
        id === 11 ? "http://cms.example.test/media/custom.jpg" : null
      );
    };
    const fetchImpl = fakeFetch(okResponse);
    await distributeApprovedPost({
      doc: approved({ image: 12, social: { image: 11 } }),
      fetchImpl,
      lookupImage,
      slug: "stories",
    });
    expect(seen).toEqual([11]);
    const init = (
      vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(JSON.parse(String(init.body)).imageUrl).toBe(
      "http://cms.example.test/media/custom.jpg"
    );
  });
});
