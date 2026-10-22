import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ decideVerificationCase: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));

vi.mock("@/lib/moderation-api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("@/lib/staff-gate", () => gate);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { approveAction, rejectAction } = await import("./actions");

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

describe("moderation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({ status: "staff", accessToken: "tok" });
  });

  it("approves without a note and redirects with a fixed notice", async () => {
    api.decideVerificationCase.mockResolvedValue({});
    const url = await redirected(
      approveAction({}, form({ organisation_id: "org_1" }))
    );
    expect(api.decideVerificationCase).toHaveBeenCalledWith(
      "tok",
      "org_1",
      "approve",
      undefined
    );
    expect(url).toBe("/moderation/org_1?notice=approved");
  });

  it("rejects with a trimmed reason", async () => {
    api.decideVerificationCase.mockResolvedValue({});
    const url = await redirected(
      rejectAction(
        {},
        form({ organisation_id: "org_1", reason: " No papers " })
      )
    );
    expect(api.decideVerificationCase).toHaveBeenCalledWith(
      "tok",
      "org_1",
      "reject",
      "No papers"
    );
    expect(url).toBe("/moderation/org_1?notice=rejected");
  });

  it("refuses a rejection without a usable reason before calling the API", async () => {
    const state = await rejectAction(
      {},
      form({ organisation_id: "org_1", reason: "no" })
    );
    expect(state).toEqual({ code: "invalid", reason: "no" });
    expect(api.decideVerificationCase).not.toHaveBeenCalled();
  });

  it("does not trust a malformed id", async () => {
    const url = await redirected(
      approveAction({}, form({ organisation_id: "../x" }))
    );
    expect(url).toBe("/moderation");
    expect(api.decideVerificationCase).not.toHaveBeenCalled();
  });

  it("sends a non-staff session away without calling the API", async () => {
    gate.requireGate.mockResolvedValue({ status: "refused", email: "a@b.c" });
    const url = await redirected(
      approveAction({}, form({ organisation_id: "org_1" }))
    );
    expect(url).toBe("/");
    expect(api.decideVerificationCase).not.toHaveBeenCalled();
  });

  it("explains a missing authenticator and keeps the typed reason", async () => {
    api.decideVerificationCase.mockRejectedValue(
      new AuthApiError(403, "superuser_mfa_required: enrol")
    );
    const state = await rejectAction(
      {},
      form({ organisation_id: "org_1", reason: "Not enough detail" })
    );
    expect(state).toEqual({ code: "mfa", reason: "Not enough detail" });
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("maps a duplicate decision (409) without reporting it", async () => {
    api.decideVerificationCase.mockRejectedValue(
      new AuthApiError(409, "Organisation is already verified")
    );
    const state = await approveAction({}, form({ organisation_id: "org_1" }));
    expect(state.code).toBe("already-decided");
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("sends an ended session to sign-in", async () => {
    api.decideVerificationCase.mockRejectedValue(new AuthApiError(401, "x"));
    const url = await redirected(
      approveAction({}, form({ organisation_id: "org_1" }))
    );
    expect(url).toBe("/signin?sign_in=expired");
  });

  it("reports unexpected API failures under admin-moderation", async () => {
    const error = new AuthApiError(500, "boom");
    api.decideVerificationCase.mockRejectedValue(error);
    const state = await approveAction({}, form({ organisation_id: "org_1" }));
    expect(state.code).toBe("failed");
    expect(report.reportError).toHaveBeenCalledWith(error, "admin-moderation");
  });
});
