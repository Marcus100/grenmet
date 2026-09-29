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
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const body = await (await GET()).json();
    expect(body.stories).toEqual({ status: "unavailable" });
    expect(body.deskUpdates.status).toBe("ok");
    expect(body.deskUpdates.items[0].category).toBe("Announcement");
    expect(body.publications.status).toBe("ok");
  });
});
