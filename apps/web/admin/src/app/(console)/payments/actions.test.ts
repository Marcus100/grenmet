import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ createPayout: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/payments-api", () => api);
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

const { recordPayoutAction } = await import("./actions");

const GOOD = {
  organisation_id: "org_1",
  amount: "12.50",
  reference: "TT-1",
  note: "",
};

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

describe("recordPayoutAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends minor units and redirects with a fixed notice", async () => {
    api.createPayout.mockResolvedValue({});
    const url = await redirected(recordPayoutAction(form(GOOD)));
    expect(api.createPayout).toHaveBeenCalledWith("tok", {
      organisation_id: "org_1",
      amount_minor: 1250,
      currency: "XCD",
      reference: "TT-1",
      note: null,
    });
    expect(url).toContain("notice=payout-recorded");
  });

  it("does not call the API for an invalid payout", async () => {
    const url = await redirected(
      recordPayoutAction(form({ ...GOOD, amount: "0" }))
    );
    expect(api.createPayout).not.toHaveBeenCalled();
    expect(url).toContain("notice=payout-invalid");
  });

  it("maps an over-balance 409 to a notice without echoing the detail", async () => {
    api.createPayout.mockRejectedValue(
      new AuthApiError(
        409,
        "The organisation is owed 100 XCD; payout is larger"
      )
    );
    const url = await redirected(recordPayoutAction(form(GOOD)));
    expect(url).toContain("notice=payout-too-large");
    expect(url).not.toContain("owed");
  });

  it("reports server failures", async () => {
    api.createPayout.mockRejectedValue(new AuthApiError(502, "bad"));
    const url = await redirected(recordPayoutAction(form(GOOD)));
    expect(url).toContain("notice=payout-failed");
    expect(report.reportError).toHaveBeenCalledWith(
      expect.any(AuthApiError),
      "admin-payments"
    );
  });
});
