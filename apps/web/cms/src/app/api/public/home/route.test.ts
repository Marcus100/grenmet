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
