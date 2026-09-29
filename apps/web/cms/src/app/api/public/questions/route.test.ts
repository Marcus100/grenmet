import { describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { GET } from "./route";

describe("public questions feed", () => {
  it("filters by a known topic, published only", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(
      new Request("http://localhost/api/public/questions?topic=tropical")
    );
    expect(response.status).toBe(200);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "questions",
        overrideAccess: false,
        where: {
          status: { equals: "published" },
          topics: { contains: "tropical" },
        },
      })
    );
  });
  it("rejects unknown topics", async () => {
    const response = await GET(
      new Request("http://localhost/api/public/questions?topic=secret")
    );
    expect(response.status).toBe(400);
  });
});
