import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bundlesCall = vi.fn();
const capabilitiesCall = vi.fn();
const rosterCall = vi.fn();

vi.mock("server-only", () => ({}));
// apiOptions is async and carries the client: a missing `await` before a spread drops it silently.
vi.mock("@/lib/api", () => ({
  apiOptions: async () => ({ client: "test-client" }),
}));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  organisationsListRoleBundles: (...a: unknown[]) => bundlesCall(...a),
  organisationsMyTeamCapabilities: (...a: unknown[]) => capabilitiesCall(...a),
  organisationsListTeamMembers: (...a: unknown[]) => rosterCall(...a),
}));

const { getTeam } = await import("./team");

const context = {
  ok: true as const,
  accessToken: "t",
  organisationId: "org_1",
};
const viewer = { page: 1 };
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
const rosterMember = (id: string, role = "member", grants: unknown[] = []) => ({
  membership_id: id,
  name: ` ${id} `,
  role,
  grants,
});

beforeEach(() => {
  vi.clearAllMocks();
  bundlesCall.mockReturnValue(
    ok([
      { role_key: "events-door", product: "events" },
      { role_key: "bookings-desk", product: "bookings" },
    ])
  );
  capabilitiesCall.mockReturnValue(
    ok({ role: "admin", managed_products: ["events"], is_admin_or_owner: true })
  );
});

describe("getTeam", () => {
  it("reads the roster in one call for the resolved organisation, keeping only Events grants", async () => {
    rosterCall.mockReturnValue(
      ok({
        data: [
          rosterMember("m1"),
          rosterMember("m2", "member", [
            { id: "g1", role_key: "events-door" },
            { id: "g2", role_key: "bookings-desk" },
          ]),
        ],
        count: 2,
        page: 1,
        size: 25,
      })
    );
    const team = await getTeam(context, viewer);
    expect(rosterCall).toHaveBeenCalledTimes(1);
    expect(rosterCall).toHaveBeenCalledWith(
      expect.objectContaining({
        client: "test-client",
        headers: { "X-Barrels-Organisation": "org_1" },
        query: { page: 1, size: 25 },
      })
    );
    if (team.kind !== "ok") {
      throw new Error("expected ok");
    }
    expect(team.members.map((m) => [m.fullName, m.grants.length])).toEqual([
      ["m1", 0],
      ["m2", 1],
    ]);
    expect(team.members[0]).not.toHaveProperty("email");
    expect(team.bundles).toHaveLength(1);
    expect(team.totalPages).toBe(1);
  });

  it("takes removal and owner status from the capabilities, not from a refusal", async () => {
    rosterCall.mockReturnValue(ok({ data: [], count: 0, page: 1, size: 25 }));
    let team = await getTeam(context, viewer);
    expect(team).toMatchObject({
      viewer: { canRemove: true, isOwner: false },
    });
    capabilitiesCall.mockReturnValue(
      ok({ role: "owner", managed_products: [], is_admin_or_owner: true })
    );
    team = await getTeam(context, viewer);
    expect(team).toMatchObject({ viewer: { canRemove: true, isOwner: true } });
    capabilitiesCall.mockReturnValue(
      ok({
        role: "member",
        managed_products: ["events"],
        is_admin_or_owner: false,
      })
    );
    team = await getTeam(context, viewer);
    expect(team).toMatchObject({
      viewer: { canRemove: false, isOwner: false },
    });
  });

  it("is forbidden when the caller manages no team", async () => {
    rosterCall.mockReturnValue(failing(403));
    expect(await getTeam(context, viewer)).toEqual({ kind: "forbidden" });
    rosterCall.mockReturnValue(ok({ data: [], count: 0, page: 1, size: 25 }));
    bundlesCall.mockReturnValue(failing(403));
    expect(await getTeam(context, viewer)).toEqual({ kind: "forbidden" });
  });

  it("is not-found for an unknown organisation", async () => {
    bundlesCall.mockReturnValue(failing(404));
    expect(await getTeam(context, viewer)).toEqual({ kind: "not-found" });
  });

  it("throws a 401 from the bundles read to the error page", async () => {
    bundlesCall.mockReturnValue(failing(401));
    rosterCall.mockReturnValue(ok({ data: [], count: 0, page: 1, size: 25 }));
    await expect(getTeam(context, viewer)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws other failures", async () => {
    rosterCall.mockReturnValue(failing(500));
    await expect(getTeam(context, viewer)).rejects.toBeInstanceOf(
      ResponseError
    );
  });
});
