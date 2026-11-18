import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  addPrintixMember: vi.fn(),
  setPrintixAccess: vi.fn(),
}));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("@/lib/staff-gate", () => gate);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { addPrintixMemberAction, setPrintixAccessAction } = await import(
  "./printix-actions"
);

const REASON = "Rehearsal staff for the 14 Dec event";

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

const addForm = (extra: Record<string, string> = {}) =>
  form({
    organisation_id: "org_1",
    user: "ann@example.gd",
    access: "organiser",
    reason: REASON,
    ...extra,
  });

const setForm = (extra: Record<string, string> = {}) =>
  form({
    organisation_id: "org_1",
    membership_id: "mem_1",
    access: "gate_lead",
    reason: REASON,
    ...extra,
  });

describe("printix actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
  });

  it("adds a person and redirects with a fixed notice", async () => {
    api.addPrintixMember.mockResolvedValue({});
    const url = await redirected(addPrintixMemberAction(addForm()));
    expect(api.addPrintixMember).toHaveBeenCalledWith("tok", "org_1", {
      email: "ann@example.gd",
      access: "organiser",
      reason: REASON,
    });
    expect(url).toBe(
      "/organisations/org_1?notice=printix-added#printix-heading"
    );
  });

  it("changes access for a membership", async () => {
    api.setPrintixAccess.mockResolvedValue({});
    const url = await redirected(setPrintixAccessAction(setForm()));
    expect(api.setPrintixAccess).toHaveBeenCalledWith("tok", "org_1", "mem_1", {
      access: "gate_lead",
      reason: REASON,
    });
    expect(url).toContain("notice=printix-changed");
  });

  it("does not call the API for invalid input", async () => {
    const url = await redirected(
      addPrintixMemberAction(addForm({ reason: "short" }))
    );
    expect(url).toContain("notice=printix-invalid");
    expect(api.addPrintixMember).not.toHaveBeenCalled();
    const bad = await redirected(
      setPrintixAccessAction(setForm({ membership_id: "../x" }))
    );
    expect(bad).toContain("notice=printix-invalid");
    expect(api.setPrintixAccess).not.toHaveBeenCalled();
  });

  it("says plainly when the person has no account, without reporting", async () => {
    api.addPrintixMember.mockRejectedValue(
      new AuthApiError(404, "Account not found")
    );
    const url = await redirected(addPrintixMemberAction(addForm()));
    expect(url).toContain("notice=printix-no-account");
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure", async () => {
    api.setPrintixAccess.mockRejectedValue(new AuthApiError(500, "boom"));
    const url = await redirected(setPrintixAccessAction(setForm()));
    expect(url).toContain("notice=printix-failed");
    expect(report.reportError).toHaveBeenCalled();
  });

  it("sends a signed-out caller to sign in", async () => {
    api.setPrintixAccess.mockRejectedValue(new AuthApiError(401, "expired"));
    expect(await redirected(setPrintixAccessAction(setForm()))).toBe(
      "/signin?sign_in=expired"
    );
  });
});
