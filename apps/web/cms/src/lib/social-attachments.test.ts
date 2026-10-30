import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  getEnv: () => ({ AUTH_API_URL: "http://api.test" }),
}));
vi.mock("./report-error", () => ({ reportError: vi.fn() }));

import {
  attachmentFilename,
  socialAttachmentEndpoint,
} from "./social-attachments";
import { attachmentHref } from "./social-attachments-view";

afterEach(() => vi.unstubAllGlobals());

const call = (query: string, user: unknown = { id: 1 }) =>
  socialAttachmentEndpoint({
    url: `http://cms.test/api/social-attachment?${query}`,
    user,
  } as unknown as PayloadRequest);
const upstream = (init: ResponseInit & { body?: string } = {}) =>
  vi.fn().mockResolvedValue(
    new Response(init.body ?? "file-bytes", {
      status: 200,
      headers: { "content-type": "image/png" },
      ...init,
    })
  );

describe("download names and addresses", () => {
  it("makes a safe, readable file name", () => {
    expect(attachmentFilename("GMS-2026-10-27-001", "social")).toBe(
      "GMS-2026-10-27-001-social.png"
    );
    expect(attachmentFilename("urn:oid:2.49.0.1/../x", "pdf")).toBe(
      "urn-oid-2.49.0.1-..-x.pdf"
    );
    expect(attachmentFilename("///", "map")).toBe("warning-map.png");
  });
  it("builds the staff download address", () => {
    expect(attachmentHref("urn:oid:1.2", "map")).toBe(
      "/api/social-attachment?identifier=urn%3Aoid%3A1.2&kind=map"
    );
  });
});

describe("GET /api/social-attachment", () => {
  it("is staff only", async () => {
    expect((await call("identifier=A&kind=pdf", null)).status).toBe(401);
  });

  it.each([
    "kind=pdf",
    "identifier=A",
    "identifier=A&kind=exe",
    `identifier=${"x".repeat(201)}&kind=pdf`,
  ])("refuses a bad request: %s", async (query) => {
    const fetcher = upstream();
    vi.stubGlobal("fetch", fetcher);
    expect((await call(query)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("hands back the warning's file as a download", async () => {
    const fetcher = upstream();
    vi.stubGlobal("fetch", fetcher);
    const response = await call("identifier=GMS-1&kind=social");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("file-bytes");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="GMS-1-social.png"'
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://api.test/api/cap/alerts/GMS-1/attachments/social"
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "follow" });
  });

  it("encodes a warning identifier that contains colons", async () => {
    const fetcher = upstream();
    vi.stubGlobal("fetch", fetcher);
    await call("identifier=urn%3Aoid%3A1.2&kind=pdf");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://api.test/api/cap/alerts/urn%3Aoid%3A1.2/attachments/pdf"
    );
  });

  it("says a missing file is missing, and an unreachable system is unavailable", async () => {
    vi.stubGlobal("fetch", upstream({ status: 404, body: "" }));
    const missing = await call("identifier=GMS-1&kind=map");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toContain(
      "published, actual"
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await call("identifier=GMS-1&kind=map")).status).toBe(502);
    vi.stubGlobal("fetch", upstream({ status: 500, body: "boom" }));
    expect((await call("identifier=GMS-1&kind=map")).status).toBe(502);
  });
});
