import {
  getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey,
  listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey,
  listPeriodsApiV1HrRostersPeriodsGetQueryKey,
  readHrEmploymentApiV1HrEmploymentUserIdGetQueryKey,
  readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey,
  readUsersApiV1AuthUsersGetQueryKey,
} from "@grenmet/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  invalidateAfterEmploymentChange,
  invalidateAfterRosterImport,
  invalidateAfterUserOnboard,
} from "./hr-invalidation";

function fakeClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  return {
    client: { invalidateQueries } as unknown as QueryClient,
    invalidateQueries,
  };
}

function invalidatedKeys(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map((call) => JSON.stringify(call[0].queryKey));
}

describe("invalidateAfterRosterImport", () => {
  it("targets periods, members, and the specific period — never a blanket invalidate", async () => {
    const { client, invalidateQueries } = fakeClient();
    await invalidateAfterRosterImport(client, {
      departmentId: "dept_met",
      periodId: "p-1",
    });
    const keys = invalidatedKeys(invalidateQueries);
    expect(keys).toContain(
      JSON.stringify(
        listPeriodsApiV1HrRostersPeriodsGetQueryKey({
          department_id: "dept_met",
        })
      )
    );
    expect(keys).toContain(
      JSON.stringify(
        listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
          "dept_met"
        )
      )
    );
    expect(keys).toContain(
      JSON.stringify(getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey("p-1"))
    );
    // Every call carries a specific queryKey — no app-wide invalidate.
    for (const call of invalidateQueries.mock.calls) {
      expect(call[0]?.queryKey).toBeDefined();
    }
  });

  it("omits the period-detail key when no periodId is given", async () => {
    const { client, invalidateQueries } = fakeClient();
    await invalidateAfterRosterImport(client, { departmentId: "dept_met" });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateAfterEmploymentChange", () => {
  it("invalidates employment, users, and both old+new department members (deduped)", async () => {
    const { client, invalidateQueries } = fakeClient();
    await invalidateAfterEmploymentChange(client, {
      userId: "u-1",
      departmentIds: ["dept_old", "dept_new", undefined, "dept_new"],
    });
    const keys = invalidatedKeys(invalidateQueries);
    expect(keys).toContain(
      JSON.stringify(readHrEmploymentApiV1HrEmploymentUserIdGetQueryKey("u-1"))
    );
    expect(keys).toContain(
      JSON.stringify(readUsersApiV1AuthUsersGetQueryKey())
    );
    expect(keys).toContain(
      JSON.stringify(
        listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
          "dept_old"
        )
      )
    );
    expect(keys).toContain(
      JSON.stringify(
        listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
          "dept_new"
        )
      )
    );
    // employment + users + 2 unique departments = 4 (duplicate/undefined dropped).
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });
});

describe("invalidateAfterUserOnboard", () => {
  it("invalidates users, role assignments, and the department members", async () => {
    const { client, invalidateQueries } = fakeClient();
    await invalidateAfterUserOnboard(client, { departmentId: "dept_met" });
    const keys = invalidatedKeys(invalidateQueries);
    expect(keys).toContain(
      JSON.stringify(readUsersApiV1AuthUsersGetQueryKey())
    );
    expect(keys).toContain(
      JSON.stringify(readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey())
    );
    expect(keys).toContain(
      JSON.stringify(
        listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
          "dept_met"
        )
      )
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });

  it("skips department members when no department is given", async () => {
    const { client, invalidateQueries } = fakeClient();
    await invalidateAfterUserOnboard(client, {});
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
