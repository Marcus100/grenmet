import {
  janitorialCreateArea,
  janitorialCreateAreaBodySchema,
  janitorialCreateBuilding,
  janitorialCreateBuildingBodySchema,
  janitorialCreateContractor,
  janitorialCreateContractorBodySchema,
  janitorialCreateGrants,
  janitorialCreateGrantsBodySchema,
  janitorialCreateSection,
  janitorialCreateSectionBodySchema,
  janitorialCreateShiftAssignment,
  janitorialCreateShiftAssignmentBodySchema,
  janitorialCreateShiftPattern,
  janitorialCreateShiftPatternBodySchema,
  janitorialCreateStaff,
  janitorialCreateStaffBodySchema,
  janitorialCreateTask,
  janitorialCreateTaskBodySchema,
  janitorialCreateZone,
  janitorialCreateZoneBodySchema,
  janitorialRevokeGrant,
  janitorialUpdateArea,
  janitorialUpdateAreaBodySchema,
  janitorialUpdateBuilding,
  janitorialUpdateBuildingBodySchema,
  janitorialUpdateContractor,
  janitorialUpdateContractorBodySchema,
  janitorialUpdateSection,
  janitorialUpdateSectionBodySchema,
  janitorialUpdateShiftAssignment,
  janitorialUpdateShiftAssignmentBodySchema,
  janitorialUpdateShiftPattern,
  janitorialUpdateShiftPatternBodySchema,
  janitorialUpdateStaff,
  janitorialUpdateStaffBodySchema,
  janitorialUpdateTask,
  janitorialUpdateTaskBodySchema,
  janitorialUpdateZone,
  janitorialUpdateZoneBodySchema,
} from "@barrelsgd/api-client";

// Client-side mutations through the gaa-admin API proxy. Bodies are parsed with
// the generated Zod schemas first so malformed input never reaches the API.
// An id of null creates the record; otherwise it is updated (send expectedRevision).

export const saveArea = (id: number | null, body: unknown) =>
  id === null
    ? janitorialCreateArea({
        body: janitorialCreateAreaBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateArea({
        path: { area_id: id },
        body: janitorialUpdateAreaBodySchema.parse(body),
      }).unwrap();

export const saveBuilding = (id: number | null, body: unknown) =>
  id === null
    ? janitorialCreateBuilding({
        body: janitorialCreateBuildingBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateBuilding({
        path: { building_id: id },
        body: janitorialUpdateBuildingBodySchema.parse(body),
      }).unwrap();

export const saveContractor = (id: string | null, body: unknown) =>
  id === null
    ? janitorialCreateContractor({
        body: janitorialCreateContractorBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateContractor({
        path: { contractor_id: id },
        body: janitorialUpdateContractorBodySchema.parse(body),
      }).unwrap();

export const saveSection = (id: number | null, body: unknown) =>
  id === null
    ? janitorialCreateSection({
        body: janitorialCreateSectionBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateSection({
        path: { section_id: id },
        body: janitorialUpdateSectionBodySchema.parse(body),
      }).unwrap();

export const saveShiftAssignment = (id: string | null, body: unknown) =>
  id === null
    ? janitorialCreateShiftAssignment({
        body: janitorialCreateShiftAssignmentBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateShiftAssignment({
        path: { assignment_id: id },
        body: janitorialUpdateShiftAssignmentBodySchema.parse(body),
      }).unwrap();

export const saveShiftPattern = (id: number | null, body: unknown) =>
  id === null
    ? janitorialCreateShiftPattern({
        body: janitorialCreateShiftPatternBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateShiftPattern({
        path: { pattern_id: id },
        body: janitorialUpdateShiftPatternBodySchema.parse(body),
      }).unwrap();

export const saveStaff = (id: string | null, body: unknown) =>
  id === null
    ? janitorialCreateStaff({
        body: janitorialCreateStaffBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateStaff({
        path: { staff_id: id },
        body: janitorialUpdateStaffBodySchema.parse(body),
      }).unwrap();

export const saveTask = (
  areaId: number,
  taskId: number | null,
  body: unknown
) =>
  taskId === null
    ? janitorialCreateTask({
        path: { area_id: areaId },
        body: janitorialCreateTaskBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateTask({
        path: { task_id: taskId },
        body: janitorialUpdateTaskBodySchema.parse(body),
      }).unwrap();

export const saveZone = (id: number | null, body: unknown) =>
  id === null
    ? janitorialCreateZone({
        body: janitorialCreateZoneBodySchema.parse(body),
      }).unwrap()
    : janitorialUpdateZone({
        path: { zone_id: id },
        body: janitorialUpdateZoneBodySchema.parse(body),
      }).unwrap();

export const grantBuildings = (body: unknown) =>
  janitorialCreateGrants({
    body: janitorialCreateGrantsBodySchema.parse(body),
  }).unwrap();

export const revokeGrant = (grantId: string) =>
  janitorialRevokeGrant({ path: { grant_id: grantId } }).unwrap();

/** The API's `detail` message when there is one; otherwise a generic fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
    const issues = (error as { issues?: { message?: unknown }[] }).issues;
    const first = issues?.[0]?.message;
    if (typeof first === "string") return first;
  }
  return fallback;
}
