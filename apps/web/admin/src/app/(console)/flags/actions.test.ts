import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createFlag: vi.fn(),
  deleteFlag: vi.fn(),
  getFlag: vi.fn(),
  updateFlag: vi.fn(),
}));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/flags-api", () => api);
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

const { deleteFlagAction, saveFlagAction } = await import("./actions");

const METRIC_MESSAGE =
  "A success metric is required to enable a flag outside local";

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

describe("flag actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a flag and redirects with a fixed notice", async () => {
    api.createFlag.mockResolvedValue({});
    const url = await redirected(
      saveFlagAction(
        {},
        form({ key: "new-checkout", enabled: "on", success_metric: "x" })
      )
    );
    expect(api.createFlag).toHaveBeenCalledOnce();
    expect(url).toBe("/flags?notice=flag-created");
  });

  it("returns the API's 422 message to the form and keeps the input", async () => {
    api.createFlag.mockRejectedValue(new AuthApiError(422, METRIC_MESSAGE));
    const state = await saveFlagAction(
      {},
      form({ key: "new-checkout", enabled: "on" })
    );
    expect(state.message).toBe(METRIC_MESSAGE);
    expect(state.values?.key).toBe("new-checkout");
    expect(state.values?.enabled).toBe("on");
  });

  it("does not echo structured validation errors", async () => {
    api.createFlag.mockRejectedValue(
      new AuthApiError(422, '[{"loc":["body","key"],"msg":"bad"}]')
    );
    const state = await saveFlagAction({}, form({ key: "new-checkout" }));
    expect(state.message).not.toContain("loc");
  });

  it("rejects an invalid key without calling the API", async () => {
    const state = await saveFlagAction({}, form({ key: "Not Valid" }));
    expect(api.createFlag).not.toHaveBeenCalled();
    expect(state.message).toBeTruthy();
  });

  it("reports server failures and shows a generic message", async () => {
    api.createFlag.mockRejectedValue(new AuthApiError(500, "boom internals"));
    const state = await saveFlagAction({}, form({ key: "new-checkout" }));
    expect(report.reportError).toHaveBeenCalledWith(
      expect.any(AuthApiError),
      "admin-flags"
    );
    expect(state.message).not.toContain("boom");
  });

  it("patches only changed fields on edit and skips no-op saves", async () => {
    api.getFlag.mockResolvedValue({
      id: "flag_1",
      key: "new-checkout",
      description: "",
      enabled: false,
      exposed: false,
      audience: {},
      success_metric: null,
      owner: null,
      expires_at: null,
      review_by: null,
    });
    api.updateFlag.mockResolvedValue({});
    const url = await redirected(
      saveFlagAction({}, form({ flag_id: "flag_1", owner: "ops" }))
    );
    expect(api.updateFlag).toHaveBeenCalledWith("tok", "flag_1", {
      owner: "ops",
    });
    expect(url).toContain("flag-updated");

    api.updateFlag.mockClear();
    const unchanged = await redirected(
      saveFlagAction({}, form({ flag_id: "flag_1" }))
    );
    expect(api.updateFlag).not.toHaveBeenCalled();
    expect(unchanged).toContain("flag-unchanged");
  });

  it("deletes a flag", async () => {
    api.deleteFlag.mockResolvedValue(undefined);
    const url = await redirected(deleteFlagAction(form({ flag_id: "flag_1" })));
    expect(api.deleteFlag).toHaveBeenCalledWith("tok", "flag_1");
    expect(url).toContain("flag-deleted");
  });
});
