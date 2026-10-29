import { describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { GET } from "./route";

/** The kind a live-post query asks for, read from inside its window clause. */
function kindOf(where: unknown): string {
  const clauses = (where as { and: Record<string, unknown>[] }).and;
  const clause = clauses.find((item) => "kind" in item) as
    | { kind: { equals: string } }
    | undefined;
  return clause?.kind.equals ?? "";
}

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

describe("homepage leads and Weather now", () => {
  it("leads with the flagged story and question, then the newest; hides expired notes", async () => {
    const story = (id: number, status = "published") => ({
      id,
      title: `Story ${id}`,
      slug: `stories/2026/09/s${id}`,
      kind: "local-story",
      status,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const question = {
      id: 7,
      question: "Why is it humid?",
      slug: "questions/why-humid",
      shortAnswer: "Warm sea air holds water.",
      status: "published",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const find = vi.fn(
      ({ collection, where }: { collection: string; where: unknown }) => {
        const flagged = JSON.stringify(where).includes("leadOnHomepage");
        const featured = JSON.stringify(where).includes('"featured"');
        if (collection === "live-posts") {
          // The note query asks only for notes that are unexpired; an expired
          // note is filtered out by the database, so none comes back here.
          expect(kindOf(where)).toBe("note");
          expect(JSON.stringify(where)).toContain("expiresAt");
          return Promise.resolve({ docs: [] });
        }
        if (collection === "stories")
          return Promise.resolve({
            docs: flagged ? [story(2)] : [story(1), story(2)],
          });
        return Promise.resolve({ docs: featured ? [question] : [] });
      }
    );
    const findGlobal = vi.fn(({ slug }: { slug: string }) =>
      Promise.resolve(
        slug === "homepage" ? { hiddenSections: ["discover"] } : {}
      )
    );
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
    const body = await (await GET()).json();
    expect(body.stories.items.map((item: { id: string }) => item.id)).toEqual([
      "2",
      "1",
    ]);
    expect(body.questions.items.map((item: { id: string }) => item.id)).toEqual(
      ["7"]
    );
    expect(body.settings.hiddenSections).toEqual(["discover"]);
    expect(body.weatherNow.items.note).toBeNull();
    expect(body.weatherNow.items).not.toHaveProperty("imagery");
  });
});

describe("homepage hidden sections", () => {
  const withHomepage = (homepage: Record<string, unknown>) => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const findGlobal = vi.fn(({ slug }: { slug: string }) =>
      Promise.resolve(slug === "homepage" ? homepage : {})
    );
    vi.mocked(getPayload).mockResolvedValue({ find, findGlobal } as never);
  };

  it("passes the hidden sections through; wording and links are no longer editable", async () => {
    withHomepage({
      hiddenSections: ["grenada-in-data"],
      // Old data the CMS no longer reads.
      sectionCopy: { stories: { title: "Island stories" } },
    });
    const { settings } = await (await GET()).json();
    expect(settings.hiddenSections).toEqual(["grenada-in-data"]);
    expect(settings.sectionCopy).toEqual({});
    expect(settings.exploreReading).toEqual({});
  });

  it("sends no wording or hidden sections when unset", async () => {
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
          const kind = kindOf(where);
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
                relatedLinks: [
                  {
                    url: "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
                    title: "Marine Bulletin",
                    isMain: true,
                  },
                ],
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
      kind: null,
      title: "Marine Bulletin",
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
