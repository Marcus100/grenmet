import { NotFound } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPreviewToken } from "../../../../lib/preview-link";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { reportError } from "../../../../lib/report-error";
import { GET } from "./route";

const SECRET = "cms-test-only-secret-with-at-least-32-characters";
const NOW = new Date();

beforeEach(() => {
  vi.stubEnv("PAYLOAD_SECRET", SECRET);
  vi.stubEnv("DATABASE_URL", "postgresql://cms:unused@localhost:5432/gms_cms");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const request = (token: string | null) =>
  new Request(
    `http://localhost/api/public/preview${token === null ? "" : `?token=${encodeURIComponent(token)}`}`
  );
const tokenFor = (
  collection: "stories" | "live-posts" | "questions",
  id: number
) => signPreviewToken({ collection, id, now: NOW, secret: SECRET });

const draftStory = {
  id: 42,
  title: "Season preparation",
  slug: "stories/2026/10/season-preparation",
  kind: "grenada",
  summary: "Get ready",
  body: null,
  status: "draft",
  publishAt: "2026-10-30T07:00:00.000Z",
  unpublishAt: null,
  topics: [],
  publishedAt: null,
  updatedAt: "2026-10-28T00:00:00.000Z",
  relatedLinks: [],
  author: { id: 9, email: "private@example.test" },
};

describe("preview of an unpublished item", () => {
  it("returns the public shape of a draft, marked as a draft, never cached or indexed", async () => {
    const findByID = vi.fn().mockResolvedValue(draftStory);
    vi.mocked(getPayload).mockResolvedValue({ findByID } as never);
    const response = await GET(request(tokenFor("stories", 42)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const body = await response.json();
    expect(body.preview).toMatchObject({
      collection: "stories",
      status: "draft",
      publishAt: "2026-10-30T07:00:00.000Z",
      unpublishAt: null,
    });
    expect(body.preview.item).toMatchObject({
      id: "42",
      title: "Season preparation",
      collection: "stories",
    });
    expect(JSON.stringify(body)).not.toContain("private@example.test");
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "stories",
        id: 42,
        overrideAccess: true,
      })
    );
  });

  it("shows a draft live post with its public fields", async () => {
    const findByID = vi.fn().mockResolvedValue({
      id: 7,
      kind: "note",
      title: "Duty forecaster's note",
      text: "Showers ease this afternoon.",
      status: "published",
      publishedAt: "2026-10-29T12:00:00.000Z",
      expiresAt: "2026-10-29T16:00:00.000Z",
      relatedLinks: [],
      updatedAt: "2026-10-29T12:00:00.000Z",
    });
    vi.mocked(getPayload).mockResolvedValue({ findByID } as never);
    const response = await GET(request(tokenFor("live-posts", 7)));
    const body = await response.json();
    expect(body.preview.item).toMatchObject({
      kind: "note",
      text: "Showers ease this afternoon.",
    });
  });

  it("answers the same way for a missing document as for a bad token", async () => {
    const findByID = vi.fn().mockRejectedValue(new NotFound());
    vi.mocked(getPayload).mockResolvedValue({ findByID } as never);
    const missing = await GET(request(tokenFor("questions", 3)));
    const forged = await GET(request("not-a-real-token"));
    expect(missing.status).toBe(404);
    expect(forged.status).toBe(404);
    expect(await missing.json()).toEqual(await forged.json());
    expect(reportError).not.toHaveBeenCalled();
  });

  it("refuses a missing token without reading the database", async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(404);
    expect(getPayload).not.toHaveBeenCalled();
  });

  it("says the preview is unavailable, and reports it, when the database fails", async () => {
    const failure = new Error("connection refused");
    const findByID = vi.fn().mockRejectedValue(failure);
    vi.mocked(getPayload).mockResolvedValue({ findByID } as never);
    const response = await GET(request(tokenFor("stories", 42)));
    expect(response.status).toBe(503);
    expect(reportError).toHaveBeenCalledWith(failure, "cms-public-preview");
  });
});
