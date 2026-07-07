import type {
  SrcAuthSchemasRolePublic as RolePublic,
  UserPublic,
  UserRoleAssignmentPublic,
} from "@grenmet/api-client";
import { format } from "date-fns";

/** Display status vocabulary mapped from the real `is_active` flag. */
export type UserRowStatus = "Active" | "Deactivated";

/**
 * View-model for a row in the users table. Presentation shape consumed by the
 * columns/table components; carries the real `UserPublic` so row actions
 * (manage roles, activate/deactivate) can operate on the live record.
 */
export interface UserRow {
  email: string;
  isSuperuser: boolean;
  /** Sortable epoch ms for the join date (0 when unknown). */
  joinedAt: number;
  /** Formatted join date, e.g. "24 Jun 2024, 9:23 AM". */
  joinedDate: string;
  /** Minutes since last login; drives the avatar activity badge. */
  lastActiveMinutes: number;
  name: string;
  roles: string[];
  status: UserRowStatus;
  user: UserPublic;
  username: string;
}

const JOINED_DATE_FORMAT = "dd MMM yyyy, h:mm a";
/** Longer than every "recent" bucket in the avatar badge → renders inactive. */
const NEVER_ACTIVE_MINUTES = 365 * 24 * 60;

function fullName(user: UserPublic): string {
  return (
    user.full_name?.trim() ||
    `${user.first_name} ${user.last_name}`.trim() ||
    user.username
  );
}

function minutesSince(timestamp: string | null | undefined): number {
  if (!timestamp) return NEVER_ACTIVE_MINUTES;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return NEVER_ACTIVE_MINUTES;
  return Math.max(0, Math.round((Date.now() - then) / 60_000));
}

function joinedParts(timestamp: string | null | undefined): {
  joinedDate: string;
  joinedAt: number;
} {
  if (!timestamp) return { joinedDate: "—", joinedAt: 0 };
  const parsed = new Date(timestamp);
  const at = parsed.getTime();
  if (Number.isNaN(at)) return { joinedDate: "—", joinedAt: 0 };
  return { joinedDate: format(parsed, JOINED_DATE_FORMAT), joinedAt: at };
}

/**
 * Build table rows from the three live queries. Roles are joined client-side:
 * assignment.user_id → assignment.role_id → role.name.
 */
export function toUserRows(
  users: UserPublic[],
  roles: RolePublic[],
  assignments: UserRoleAssignmentPublic[]
): UserRow[] {
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const roleNamesByUserId = new Map<string, string[]>();
  for (const assignment of assignments) {
    const roleName = roleNameById.get(assignment.role_id);
    if (!roleName) continue;
    const list = roleNamesByUserId.get(assignment.user_id) ?? [];
    if (!list.includes(roleName)) list.push(roleName);
    roleNamesByUserId.set(assignment.user_id, list);
  }

  return users.map((user) => {
    const { joinedDate, joinedAt } = joinedParts(user.created_at);
    return {
      user,
      name: fullName(user),
      email: user.email,
      username: user.username,
      roles: roleNamesByUserId.get(user.id) ?? [],
      isSuperuser: user.is_superuser ?? false,
      status: user.is_active === false ? "Deactivated" : "Active",
      joinedDate,
      joinedAt,
      lastActiveMinutes: minutesSince(user.last_login_at),
    };
  });
}

/** Filter dropdown options ("All" first), derived from the live role list. */
export function roleFilterOptions(roles: RolePublic[]): string[] {
  return ["All", ...roles.map((role) => role.name)];
}

export const statusFilterOptions: string[] = ["All", "Active", "Deactivated"];
