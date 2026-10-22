import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_REQUIRED } from "./action-result";

const resolveOrgContext = vi.fn();
const reportError = vi.fn();
const revalidatePath = vi.fn();
const grantCall = vi.fn();
const revokeCall = vi.fn();
const issuedCall = vi.fn();
const deleteCall = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
vi.mock("./org-context", () => ({
  resolveOrgContext: () => resolveOrgContext(),
}));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  organisationsGrantMemberRole: (...a: unknown[]) => grantCall(...a),
  organisationsRevokeMemberGrant: (...a: unknown[]) => revokeCall(...a),
  organisationsListIssuedGrants: (...a: unknown[]) => issuedCall(...a),
  organisationsDeleteMember: (...a: unknown[]) => deleteCall(...a),
}));

const { grantRole, loadIssuedGrants, removeMember, revokeGrant } = await import(
  "./team-actions"
);

function responseError(status: number, detail: unknown) {
  return new ResponseError({
    data: { detail },
    status,
    statusText: "",
    request: new Request("http://api.test"),
    response: new Response(),
  });
}
const ok = (value: unknown) => ({ unwrap: () => Promise.resolve(value) });
const failing = (error: unknown) => ({ unwrap: () => Promise.reject(error) });

const FUTURE = "2999-01-01";

beforeEach(() => {
  for (const mock of [
    resolveOrgContext,
    reportError,
    revalidatePath,
    grantCall,
    revokeCall,
    issuedCall,
    deleteCall,
  ]) {
    mock.mockReset();
  }
  resolveOrgContext.mockResolvedValue({
    ok: true,
    accessToken: "tok",
    organisationId: "org_1",
  });
});

describe("grantRole", () => {
  it("sends the server-resolved organisation and an end-of-day UTC expiry", async () => {
    grantCall.mockReturnValue(ok({ id: "g1" }));
    const result = await grantRole({
      membershipId: "mem_1",
      roleKey: "events-door",
      expiresOn: FUTURE,
    });
    expect(result).toEqual({ ok: true, data: { id: "g1" } });
    expect(grantCall).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Barrels-Organisation": "org_1" },
        path: { membership_id: "mem_1" },
        body: {
          role_key: "events-door",
          expires_at: "2999-01-01T23:59:59.000Z",
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dash/team");
  });

  it("sends no expiry when none is chosen", async () => {
    grantCall.mockReturnValue(ok({ id: "g1" }));
    await grantRole({
      membershipId: "mem_1",
      roleKey: "events-door",
      expiresOn: "",
    });
    expect(grantCall.mock.calls[0]?.[0].body.expires_at).toBeNull();
  });

  it("refuses malformed ids and past dates without calling the API", async () => {
    const bad = await grantRole({
      membershipId: "../x",
      roleKey: "events-door",
      expiresOn: "",
    });
    const past = await grantRole({
      membershipId: "mem_1",
      roleKey: "events-door",
      expiresOn: "2001-01-01",
    });
    expect(bad.ok).toBe(false);
    expect(past.ok).toBe(false);
    expect(grantCall).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in and a member without an organisation to ask an admin", async () => {
    resolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: "signed-out",
    });
    expect(
      await grantRole({
        membershipId: "m",
        roleKey: "events-door",
        expiresOn: "",
      })
    ).toEqual({ ok: false, error: SIGN_IN_REQUIRED });
    resolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: "no-organisation",
    });
    const result = await grantRole({
      membershipId: "m",
      roleKey: "events-door",
      expiresOn: "",
    });
    expect(result.ok === false && result.error).toContain("isn't linked");
    expect(grantCall).not.toHaveBeenCalled();
  });

  it.each([
    [403, "You cannot change your own roles", "own roles"],
    [
      403,
      "You can only change roles whose permissions you hold yourself",
      "hold yourself",
    ],
    [403, "Your organisation does not have access to Events", "Events access"],
    [409, "That member already holds this role", "already holds"],
    [
      409,
      "Roles for this member changed at the same time; try again",
      "same time",
    ],
    [422, "This grant cannot outlast your own access to the role", "outlast"],
  ])(
    "shows a real %i refusal (%s) without reporting it",
    async (status, detail, fragment) => {
      grantCall.mockReturnValue(failing(responseError(status, detail)));
      const result = await grantRole({
        membershipId: "mem_1",
        roleKey: "events-door",
        expiresOn: "",
      });
      expect(result.ok === false && result.error).toContain(fragment);
      expect(reportError).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  );

  it("reports an unexpected failure with an area tag and shows a generic line", async () => {
    const boom = new Error("db down");
    grantCall.mockReturnValue(failing(boom));
    const result = await grantRole({
      membershipId: "mem_1",
      roleKey: "events-door",
      expiresOn: "",
    });
    expect(reportError).toHaveBeenCalledWith(boom, "events-team");
    expect(result.ok === false && result.error).toContain("couldn't confirm");
  });

  it("sends a 401 back to sign-in", async () => {
    grantCall.mockReturnValue(failing(responseError(401, "x")));
    expect(
      await grantRole({
        membershipId: "m",
        roleKey: "events-door",
        expiresOn: "",
      })
    ).toEqual({ ok: false, error: SIGN_IN_REQUIRED });
  });
});

describe("revokeGrant", () => {
  it("revokes by id and revalidates the page", async () => {
    revokeCall.mockReturnValue(ok({ id: "g1" }));
    const result = await revokeGrant({ grantId: "g1" });
    expect(result.ok).toBe(true);
    expect(revokeCall).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Barrels-Organisation": "org_1" },
        path: { grant_id: "g1" },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dash/team");
  });

  it("rejects a malformed id and words a 404 as a reload hint", async () => {
    expect((await revokeGrant({ grantId: "a/b" })).ok).toBe(false);
    revokeCall.mockReturnValue(
      failing(responseError(404, "Role grant not found"))
    );
    const result = await revokeGrant({ grantId: "g1" });
    expect(result.ok === false && result.error).toContain("Reload");
  });
});

describe("loadIssuedGrants and removeMember", () => {
  it("lists what a member issued for the removal confirm", async () => {
    issuedCall.mockReturnValue(ok([{ id: "g9" }]));
    expect(await loadIssuedGrants({ membershipId: "mem_2" })).toEqual({
      ok: true,
      data: [{ id: "g9" }],
    });
    expect(issuedCall).toHaveBeenCalledWith(
      expect.objectContaining({ path: { membership_id: "mem_2" } })
    );
  });

  it("removes a member under the server-resolved organisation id", async () => {
    deleteCall.mockReturnValue(ok(undefined));
    expect((await removeMember({ membershipId: "mem_2" })).ok).toBe(true);
    expect(deleteCall).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { organisation_id: "org_1", membership_id: "mem_2" },
      })
    );
  });

  it("shows the last-owner refusal as sent", async () => {
    deleteCall.mockReturnValue(
      failing(
        responseError(409, "An organisation must keep at least one owner")
      )
    );
    const result = await removeMember({ membershipId: "mem_2" });
    expect(result.ok === false && result.error).toContain("at least one owner");
  });
});
