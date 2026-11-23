import type { RoleAssignmentScope } from "@barrelsgd/api-client";

/**
 * What the scope means to the person, in words (colour is never the only
 * signal). SELF: their own record; DEPARTMENT: the departments they manage;
 * ALL: the whole organisation.
 */
const SCOPE_LABEL: Record<RoleAssignmentScope, string> = {
  SELF: "Own record only",
  DEPARTMENT: "Your department",
  ALL: "Whole organisation",
};

export function scopeLabel(scope: RoleAssignmentScope): string {
  return SCOPE_LABEL[scope];
}
