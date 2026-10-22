import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  addOrganisationMember: vi.fn(),
  removeOrganisationMember: vi.fn(),
  updateOrganisationMember: vi.fn(),
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

const { addMemberAction, changeMemberRoleAction, removeMemberAction } =
  await import("./member-actions");

const REASON = "Support case 1042, owner asked";

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
    user: "me@barrels.gd",
    role: "owner",
    reason: REASON,
    ...extra,
  });

describe("member actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
  });

  it("adds a member by email and redirects with a fixed notice", async () => {
    api.addOrganisationMember.mockResolvedValue({});
    const url = await redirected(addMemberAction(addForm()));
    expect(api.addOrganisationMember).toHaveBeenCalledWith("tok", "org_1", {
      email: "me@barrels.gd",
      role: "owner",
      reason: REASON,
    });
    expect(url).toBe(
      "/organisations/org_1?notice=member-added#members-heading"
    );
  });

  it("sends an account id as user_id", async () => {
    api.addOrganisationMember.mockResolvedValue({});
    const id = "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11";
    await redirected(addMemberAction(addForm({ user: id })));
    expect(api.addOrganisationMember).toHaveBeenCalledWith(
      "tok",
      "org_1",
      expect.objectContaining({ user_id: id })
    );
  });

  it("refuses a short reason or bad role without calling the API", async () => {
    expect(
      await redirected(addMemberAction(addForm({ reason: "short" })))
    ).toContain("member-invalid");
    expect(
      await redirected(addMemberAction(addForm({ role: "root" })))
    ).toContain("member-invalid");
    expect(api.addOrganisationMember).not.toHaveBeenCalled();
  });

  it("does nothing for a non-staff session", async () => {
    gate.requireGate.mockResolvedValue({ status: "refused", email: "x@y.gd" });
    expect(await redirected(addMemberAction(addForm()))).toBe("/");
    expect(api.addOrganisationMember).not.toHaveBeenCalled();
  });

  it("maps 403 MFA, 403 unverified, 404, 409 and 429 to fixed notices", async () => {
    const cases: [number, string, string][] = [
      [403, "superuser_mfa_required: set up", "member-mfa"],
      [403, "email_verification_required: verify", "member-unverified"],
      [404, "Account not found", "member-missing"],
      [409, "already a member", "member-already"],
      [429, "slow", "member-throttled"],
    ];
    for (const [status, detail, notice] of cases) {
      api.addOrganisationMember.mockRejectedValueOnce(
        new AuthApiError(status, detail)
      );
      expect(await redirected(addMemberAction(addForm()))).toContain(
        `notice=${notice}`
      );
    }
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("shows a neutral notice and reports an unrecognised 403 on change and remove", async () => {
    const data = form({
      organisation_id: "org_1",
      membership_id: "mem_1",
      role: "admin",
      reason: REASON,
    });
    api.updateOrganisationMember.mockRejectedValueOnce(
      new AuthApiError(403, "Only an owner can change owners")
    );
    expect(await redirected(changeMemberRoleAction(data))).toContain(
      "member-forbidden"
    );
    api.removeOrganisationMember.mockRejectedValueOnce(
      new AuthApiError(403, "Only an owner can remove owners")
    );
    expect(await redirected(removeMemberAction(data))).toContain(
      "member-forbidden"
    );
    expect(report.reportError).toHaveBeenCalledTimes(2);
  });

  it("reports unexpected failures", async () => {
    api.addOrganisationMember.mockRejectedValueOnce(
      new AuthApiError(500, "boom")
    );
    expect(await redirected(addMemberAction(addForm()))).toContain(
      "member-failed"
    );
    expect(report.reportError).toHaveBeenCalledWith(
      expect.any(AuthApiError),
      "admin-members"
    );
  });

  it("changes a role with the reason in the body; 409 means last owner", async () => {
    api.updateOrganisationMember.mockResolvedValueOnce({});
    const data = form({
      organisation_id: "org_1",
      membership_id: "mem_1",
      role: "admin",
      reason: REASON,
    });
    expect(await redirected(changeMemberRoleAction(data))).toContain(
      "member-changed"
    );
    expect(api.updateOrganisationMember).toHaveBeenCalledWith(
      "tok",
      "org_1",
      "mem_1",
      { role: "admin", reason: REASON }
    );
    api.updateOrganisationMember.mockRejectedValueOnce(
      new AuthApiError(409, "last owner")
    );
    expect(await redirected(changeMemberRoleAction(data))).toContain(
      "member-last-owner"
    );
  });

  it("removes a member and validates the membership id", async () => {
    api.removeOrganisationMember.mockResolvedValue(undefined);
    const data = form({
      organisation_id: "org_1",
      membership_id: "mem_1",
      reason: REASON,
    });
    expect(await redirected(removeMemberAction(data))).toContain(
      "member-removed"
    );
    expect(api.removeOrganisationMember).toHaveBeenCalledWith(
      "tok",
      "org_1",
      "mem_1",
      { reason: REASON }
    );
    data.set("membership_id", "../x y");
    expect(await redirected(removeMemberAction(data))).toContain(
      "member-invalid"
    );
    expect(api.removeOrganisationMember).toHaveBeenCalledTimes(1);
  });
});
