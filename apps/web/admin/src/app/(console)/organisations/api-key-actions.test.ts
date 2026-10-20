import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ revokeApiKey: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("@/lib/staff-gate", () => ({
  requireGate: () =>
    Promise.resolve({ status: "staff", accessToken: "tok", email: "s@x.gd" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { revokeApiKeyAction } = await import("./api-key-actions");

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirected(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      return error.message.slice("REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("revokeApiKeyAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes and redirects with a fixed notice", async () => {
    api.revokeApiKey.mockResolvedValue({});
    const url = await redirected(
      revokeApiKeyAction(form({ organisation_id: "org_1", key_id: "key_1" }))
    );
    expect(api.revokeApiKey).toHaveBeenCalledWith("tok", "key_1");
    expect(url).toBe(
      "/organisations/org_1?notice=key-revoked#api-keys-heading"
    );
  });

  it("maps 404 to a missing notice and reports other failures", async () => {
    api.revokeApiKey.mockRejectedValueOnce(new AuthApiError(404, "nope"));
    expect(
      await redirected(
        revokeApiKeyAction(form({ organisation_id: "org_1", key_id: "key_1" }))
      )
    ).toContain("notice=key-missing");
    api.revokeApiKey.mockRejectedValueOnce(new AuthApiError(500, "boom"));
    expect(
      await redirected(
        revokeApiKeyAction(form({ organisation_id: "org_1", key_id: "key_1" }))
      )
    ).toContain("notice=key-failed");
    expect(report.reportError).toHaveBeenCalledWith(
      expect.any(AuthApiError),
      "admin-api-keys"
    );
  });

  it("does not call the API for a malformed key id", async () => {
    const url = await redirected(
      revokeApiKeyAction(form({ organisation_id: "org_1", key_id: "../x y" }))
    );
    expect(api.revokeApiKey).not.toHaveBeenCalled();
    expect(url).toContain("key-missing");
  });
});
