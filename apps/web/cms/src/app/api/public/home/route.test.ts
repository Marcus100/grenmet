import { describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { GET } from "./route";

describe("public home feed", () => {
  it("keeps working sections when one part fails", async () => {
    const find = vi.fn(({ collection }: { collection: string }) =>
      collection === "stories"
        ? Promise.reject(new Error("broken"))
        : Promise.resolve({
            docs: [
              {
                id: 1,
                title: "Notice",
                slug: "updates/2026/09/notice",
                kind: "announcement",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
            ],
          })
    );
    const findGlobal = vi.fn().mockRejectedValue(new Error("no globals"));
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
    const body = await (await GET()).json();
    expect(body.stories).toEqual({ status: "unavailable" });
    expect(body.deskUpdates.status).toBe("ok");
    expect(body.deskUpdates.items[0].category).toBe("Announcement");
    expect(body).not.toHaveProperty("publications");
  });
});

describe("homepage pins and Weather now", () => {
  it("leads with published pins, drops unpublished ones, hides expired notes", async () => {
    const story = (id: number, status = "published") => ({
      id,
      title: `Story ${id}`,
      slug: `stories/2026/09/s${id}`,
      kind: "local-story",
      status,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const find = vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve({
        docs: collection === "stories" ? [story(1), story(2)] : [],
      })
    );
    const findGlobal = vi.fn(({ slug }: { slug: string }) =>
      Promise.resolve(
        slug === "homepage"
          ? {
              leadStory: story(2),
              featuredQuestions: [7],
              hiddenSections: ["discover"],
            }
          : {
              note: {
                text: "Old note",
                expiresAt: "2020-01-01T00:00:00.000Z",
              },
            }
      )
    );
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
    const body = await (await GET()).json();
    expect(body.stories.items.map((item: { id: string }) => item.id)).toEqual([
      "2",
      "1",
    ]);
    expect(body.questions).toEqual({ status: "ok", items: [] });
    expect(body.settings.hiddenSections).toEqual(["discover"]);
    expect(body.weatherNow.items.note).toBeNull();
    expect(body.weatherNow.items).not.toHaveProperty("imagery");
  });
});

describe("homepage section wording and Explore today", () => {
  const withHomepage = (homepage: Record<string, unknown>) => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const findGlobal = vi.fn(({ slug }: { slug: string }) =>
      Promise.resolve(slug === "homepage" ? homepage : {})
    );
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
  };

  it("passes wording and published links through; drops blanks, drafts and unpopulated links", async () => {
    withHomepage({
      sectionCopy: {
        stories: { kicker: "  ", title: " Island stories ", intro: null },
        explore_today: { intro: "Plan around the weather." },
        desk: { kicker: "", title: "", intro: "" },
      },
      exploreReading: {
        beach: {
          relationTo: "questions",
          value: {
            status: "published",
            question: "What is a rip current?",
            slug: "questions/what-is-a-rip-current",
          },
        },
        night_sky: {
          relationTo: "stories",
          value: { status: "draft", title: "Draft", slug: "stories/x" },
        },
        fishing: { relationTo: "stories", value: 12 },
      },
      hiddenSections: ["grenada-in-data"],
    });
    const { settings } = await (await GET()).json();
    expect(settings.sectionCopy).toEqual({
      stories: { title: "Island stories" },
      "explore-today": { intro: "Plan around the weather." },
    });
    expect(settings.exploreReading).toEqual({
      beach: {
        collection: "questions",
        title: "What is a rip current?",
        slug: "questions/what-is-a-rip-current",
      },
    });
    expect(settings.hiddenSections).toEqual(["grenada-in-data"]);
  });

  it("sends no wording or links when unset", async () => {
    withHomepage({});
    const { settings } = await (await GET()).json();
    expect(settings.sectionCopy).toEqual({});
    expect(settings.exploreReading).toEqual({});
  });
});

describe("report write-ups and Weather now live posts", () => {
  it("serves both, with linked products as ids only, and fails each on its own", async () => {
    const find = vi.fn(
      ({ collection, where }: { collection: string; where: unknown }) => {
        if (collection === "live-posts") {
          expect(JSON.stringify(where)).toContain("expiresAt");
          const kind = (where as { kind: { equals: string } }).kind.equals;
          return Promise.resolve({
            docs: [
              {
                id: 3,
                kind: "video",
                title: "Midday briefing",
                text: null,
                mediaUrl: "https://youtu.be/abc123",
                publishedAt: "2026-09-30T16:00:00.000Z",
              },
              {
                id: 4,
                kind: "update",
                title: "Showers easing",
                mediaUrl: "https://youtu.be/stale",
              },
            ].filter((doc) => doc.kind === kind),
          });
        }
        if (collection === "report-notes")
          return Promise.resolve({
            docs: [
              {
                id: 9,
                title: "What the marine bulletin means",
                slug: "reports/2026/09/marine",
                linkedProduct: {
                  productId: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
                  kind: "marine",
                },
                updatedAt: "2026-09-30T00:00:00.000Z",
              },
            ],
          });
        return collection === "stories"
          ? Promise.reject(new Error("broken"))
          : Promise.resolve({ docs: [] });
      }
    );
    const findGlobal = vi.fn().mockResolvedValue({});
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
    const body = await (await GET()).json();
    expect(body.stories).toEqual({ status: "unavailable" });
    expect(body.reportNotes.items[0].linkedProduct).toEqual({
      productId: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
      kind: "marine",
    });
    expect(
      // One query per kind, grouped: updates, then videos, then audio.
      body.livePosts.items.map(
        (post: { kind: string; mediaUrl: string | null }) => [
          post.kind,
          post.mediaUrl,
        ]
      )
    ).toEqual([
      ["update", null],
      ["video", "https://youtu.be/abc123"],
    ]);
  });
});
