import type {
  SrcAuthSchemasRolePublic as RolePublic,
  UserRoleAssignmentPublic,
} from "@barrelsgd/api-client";
import { format } from "date-fns";

/**
 * Roles the app itself provisions at onboarding (see `position-roles.ts`).
 * Anything else in the roles table was created by an operator, so it is
 * classified as Custom. This is derived, not stored — the API has no such flag.
 */
const SYSTEM_ROLE_NAMES: ReadonlySet<string> = new Set([
  "staff",
  "hr-supervisor",
  "management",
  "hr-admin",
  "hr-recorder",
  "cap-author",
  "cap-approver",
  "cap-publisher",
  "cap-admin",
  "workflow-admin",
]);

export type RoleRowType = "System" | "Custom";

/**
 * View-model for a row in the roles table. Presentation shape consumed by the
 * columns/table components; carries the real `RolePublic` so row actions can
 * operate on the live record.
 */
export interface RoleRow {
  description: string;
  id: string;
  name: string;
  /** The live record, for row actions. */
  role: RolePublic;
  type: RoleRowType;
  /** Sortable epoch ms for the last update (0 when unknown). */
  updatedAt: number;
  /** Formatted last-updated date, e.g. "24 Jun 2024". */
  updatedDate: string;
  /** Distinct users currently holding this role. */
  users: number;
}

const UPDATED_DATE_FORMAT = "dd MMM yyyy";

function updatedParts(timestamp: string | null | undefined): {
  updatedDate: string;
  updatedAt: number;
} {
  if (!timestamp) return { updatedAt: 0, updatedDate: "—" };
  const parsed = new Date(timestamp);
  const at = parsed.getTime();
  if (Number.isNaN(at)) return { updatedAt: 0, updatedDate: "—" };
  return { updatedAt: at, updatedDate: format(parsed, UPDATED_DATE_FORMAT) };
}

/**
 * Build table rows from the two live queries. The holder count is joined
 * client-side: assignment.role_id → role.id, counting distinct user_ids so a
 * user scoped twice to one role is not double-counted.
 */
export function toRoleRows(
  roles: RolePublic[],
  assignments: UserRoleAssignmentPublic[]
): RoleRow[] {
  const holdersByRoleId = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const now = Date.now();
    if (
      new Date(assignment.effective_from).getTime() > now ||
      (assignment.effective_to &&
        new Date(assignment.effective_to).getTime() <= now)
    )
      continue;
    const holders =
      holdersByRoleId.get(assignment.role_id) ?? new Set<string>();
    holders.add(assignment.user_id);
    holdersByRoleId.set(assignment.role_id, holders);
  }

  return roles.map((role) => ({
    description: role.description?.trim() || "—",
    id: role.id,
    name: role.name,
    role,
    type: SYSTEM_ROLE_NAMES.has(role.name) ? "System" : "Custom",
    users: holdersByRoleId.get(role.id)?.size ?? 0,
    ...updatedParts(role.updated_at),
  }));
}

export const typeFilterOptions: string[] = ["All", "System", "Custom"];
