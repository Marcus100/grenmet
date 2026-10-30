import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { reportError } from "../../../../lib/report-error";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv(
    "PAYLOAD_SECRET",
    "cms-test-only-secret-with-at-least-32-characters"
  );
  vi.stubEnv("DATABASE_URL", "postgresql://cms:unused@localhost:5432/gms_cms");
  vi.stubEnv("GMS_SITE_URL", "https://weather.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/public/newsletter", () => {
  it("returns the ticked posts in the digest's shape, never cached", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === "stories"
          ? [
              {
                title: "Heavy rain expected",
                slug: "stories/2026/10/heavy-rain",
                summary: "What to expect",
                publishedAt: "2026-10-29T09:00:00.000Z",
                author: { id: 9, email: "private@example.test" },
              },
            ]
          : [],
    }));
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      items: [
        {
          title: "Heavy rain expected",
          url: "https://weather.example.test/explore/news/2026/10/heavy-rain",
          summary: "What to expect",
          includeInNewsletter: true,
          publishedAt: "2026-10-29T09:00:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("private@example.test");
  });

  it("says the weather site address is missing and reads nothing when GMS_SITE_URL is unset", async () => {
    vi.stubEnv("GMS_SITE_URL", "");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(getPayload).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports and answers unavailable when the database fails", async () => {
    const failure = new Error("connection refused");
    vi.mocked(getPayload).mockRejectedValue(failure);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(reportError).toHaveBeenCalledWith(failure, "cms-public-newsletter");
  });
});
