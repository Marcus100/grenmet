import type { CapProfilePublic } from "@barrelsgd/api-client";
import type { DeskPermissions } from "@/lib/desk/permissions";

/** One hazard profile: its newest version and every version, newest first. */
export interface ProfileHistory {
  key: string;
  latest: CapProfilePublic;
  name: string;
  versions: CapProfilePublic[];
}

/**
 * Groups the API's version list (every version of every key) by key. The
 * API sends them newest first within a key; the grouping keeps that order.
 */
export function groupProfiles(
  profiles: readonly CapProfilePublic[]
): ProfileHistory[] {
  const byKey = new Map<string, CapProfilePublic[]>();
  for (const profile of profiles) {
    const versions = byKey.get(profile.key) ?? [];
    versions.push(profile);
    byKey.set(profile.key, versions);
  }
  return [...byKey.entries()]
    .map(([key, versions]) => {
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      const latest = sorted[0];
      if (!latest) throw new Error("A profile key has no versions.");
      return {
        key,
        latest,
        name: latest.definition.name,
        versions: sorted,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export type ApprovalCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Whether this viewer may offer Approve on this version. Display only: the
 * API enforces the same rules, including the different-reviewer rule.
 */
export function approvalCheck(
  profile: CapProfilePublic,
  permissions: Pick<DeskPermissions, "approve" | "libraryManage">,
  userId: string
): ApprovalCheck {
  if (profile.state !== "DRAFT") {
    return { allowed: false, reason: "This version is already approved." };
  }
  if (!(permissions.libraryManage && permissions.approve)) {
    return {
      allowed: false,
      reason:
        "You need both library and approval access to approve a hazard profile.",
    };
  }
  if (profile.created_by === userId) {
    return {
      allowed: false,
      reason: "You wrote this version. A different reviewer must approve it.",
    };
  }
  if (profile.approval_errors.length > 0) {
    return {
      allowed: false,
      reason: "This version cannot be approved until its problems are fixed.",
    };
  }
  return { allowed: true };
}
