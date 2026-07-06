import {
  getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey,
  listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey,
  listPeriodsApiV1HrRostersPeriodsGetQueryKey,
  readHrEmploymentApiV1HrEmploymentUserIdGetQueryKey,
  readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey,
  readUsersApiV1AuthUsersGetQueryKey,
} from "@grenmet/api-client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Centralized "what HR queries depend on what" so mutations refresh exactly the
 * views that changed, instead of a blanket `invalidateQueries()` (which refetches
 * the whole app) or hand-rolled, drift-prone key lists per component.
 *
 * Each helper invalidates a targeted set of generated query keys; shared
 * reference-data reads use identical keys across components, so one invalidation
 * refreshes every consumer of that data at once.
 */

function invalidateKeys(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[]
): Promise<void> {
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  ).then(() => undefined);
}

/** After a staff member's employment record (department/status/…) changes. */
export function invalidateAfterEmploymentChange(
  queryClient: QueryClient,
  opts: { userId: string; departmentIds: (string | undefined)[] }
): Promise<void> {
  const departmentKeys = Array.from(
    new Set(opts.departmentIds.filter((id): id is string => Boolean(id)))
  ).map((id) =>
    listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
      id
    )
  );
  return invalidateKeys(queryClient, [
    readHrEmploymentApiV1HrEmploymentUserIdGetQueryKey(opts.userId),
    readUsersApiV1AuthUsersGetQueryKey(),
    ...departmentKeys,
  ]);
}

/** After onboarding a new user (account + role assignments + employment). */
export function invalidateAfterUserOnboard(
  queryClient: QueryClient,
  opts: { departmentId?: string }
): Promise<void> {
  const departmentKeys = opts.departmentId
    ? [
        listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
          opts.departmentId
        ),
      ]
    : [];
  return invalidateKeys(queryClient, [
    readUsersApiV1AuthUsersGetQueryKey(),
    readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey(),
    ...departmentKeys,
  ]);
}

/** After importing a grid roster into a department's period. */
export function invalidateAfterRosterImport(
  queryClient: QueryClient,
  opts: { departmentId: string; periodId?: string }
): Promise<void> {
  const keys: (readonly unknown[])[] = [
    listPeriodsApiV1HrRostersPeriodsGetQueryKey({
      department_id: opts.departmentId,
    }),
    listDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGetQueryKey(
      opts.departmentId
    ),
  ];
  if (opts.periodId) {
    keys.push(getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey(opts.periodId));
  }
  return invalidateKeys(queryClient, keys);
}
