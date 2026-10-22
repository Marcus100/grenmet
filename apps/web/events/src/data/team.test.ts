import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bundlesCall = vi.fn();
const membersCall = vi.fn();
const grantsCall = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  organisationsListRoleBundles: (...a: unknown[]) => bundlesCall(...a),
  organisationsListMembers: (...a: unknown[]) => membersCall(...a),
  organisationsListMemberGrants: (...a: unknown[]) => grantsCall(...a),
}));

const { getTeam } = await import("./team");

const context = {
  ok: true as const,
  accessToken: "t",
  organisationId: "org_1",
};
const viewer = { page: 1, userId: "user_1" };
const ok = (value: unknown) => ({ unwrap: () => Promise.resolve(value) });
const failing = (status: number) => ({
  unwrap: () =>
    Promise.reject(
      new ResponseError({
        data: {},
        status,
        statusText: "",
        request: new Request("http://api.test"),
        response: new Response(),
      })
    ),
});
const member = (id: string, userId: string, role = "member") => ({
  membership_id: id,
  user_id: userId,
  email: `${id}@example.test`,
  full_name: ` ${id} `,
  role,
  joined_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  bundlesCall.mockReturnValue(ok([{ role_key: "events-door" }]));
});

describe("getTeam", () => {
  it("reads the roster for the resolved organisation, then each member's live grants", async () => {
    membersCall.mockReturnValue(
      ok({
        data: [member("m1", "user_1"), member("m2", "u2")],
        count: 2,
        page: 1,
      })
    );
    grantsCall.mockImplementation(
      ({ path }: { path: { membership_id: string } }) =>
        ok(path.membership_id === "m2" ? [{ id: "g1" }] : [])
    );
    const team = await getTeam(context, viewer);
    expect(membersCall).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Barrels-Organisation": "org_1" },
        path: { organisation_id: "org_1" },
        query: { page: 1, size: 25 },
      })
    );
    if (team.kind !== "ok" || !team.members) {
      throw new Error("expected members");
    }
    expect(
      team.members.map((m) => [m.fullName, m.isSelf, m.grants.length])
    ).toEqual([
      ["m1", true, 0],
      ["m2", false, 1],
    ]);
    expect(team.totalPages).toBe(1);
  });

  it("is forbidden when the caller manages no team", async () => {
    bundlesCall.mockReturnValue(failing(403));
    expect(await getTeam(context, viewer)).toEqual({ kind: "forbidden" });
    expect(membersCall).not.toHaveBeenCalled();
  });

  it("hides only the roster when the API refuses it to a non-admin manager", async () => {
    membersCall.mockReturnValue(failing(403));
    const team = await getTeam(context, viewer);
    expect(team).toMatchObject({ kind: "ok", members: null });
    expect(grantsCall).not.toHaveBeenCalled();
  });

  it("treats a member who left mid-load as having no roles and rethrows real failures", async () => {
    membersCall.mockReturnValue(
      ok({ data: [member("m2", "u2")], count: 1, page: 1 })
    );
    grantsCall.mockReturnValue(failing(404));
    const team = await getTeam(context, viewer);
    expect(team.kind === "ok" && team.members?.[0]?.grants).toEqual([]);
    grantsCall.mockReturnValue(failing(500));
    await expect(getTeam(context, viewer)).rejects.toBeInstanceOf(
      ResponseError
    );
  });
});
