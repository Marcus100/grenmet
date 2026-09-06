import type { DepartmentMemberPublic } from "@barrelsgd/api-client";

/**
 * How a member of staff is named on screen.
 *
 * Two names, deliberately. The personnel record is what every surface shows —
 * the calendar, the staff directory, forms, approvals. The duty-roster grid is
 * the one exception: it is a dense name x day sheet that staff read alongside
 * the printed roster, so it prints what the roster prints.
 *
 * Those two can disagree. The GMS roster prints "J. Charles" for Jude Andre
 * Charles and "K. Bedeau" for Kenrick Dieonne Bedeau, so an initial + surname
 * derivation is wrong for both. `roster_name` on the employment record is
 * authoritative; the derivation is only a fallback for staff who have none
 * recorded yet.
 */

/** A member as the API returns them, or any shape carrying the same names. */
export type NamedMember = Pick<
  DepartmentMemberPublic,
  "first_name" | "last_name" | "full_name" | "roster_name"
>;

/** Personnel-record name: "Jude Andre Charles". */
export function displayName(member: NamedMember): string {
  const full = member.full_name?.trim();
  if (full) return full;
  const joined = [member.first_name, member.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return joined || "Unknown staff member";
}

/** Duty-roster name: the recorded `roster_name`, else "J. Charles". */
export function rosterLabel(member: NamedMember): string {
  const recorded = member.roster_name?.trim();
  if (recorded) return recorded;
  const initial = member.first_name?.trim().charAt(0).toUpperCase();
  const last = member.last_name?.trim();
  if (initial && last) return `${initial}. ${last}`;
  return last || displayName(member);
}

const WHITESPACE = /\s+/;

/** Avatar fallback: "JC" from the personnel name. */
export function initials(member: NamedMember): string {
  const parts = displayName(member).split(WHITESPACE).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts.at(-1)?.charAt(0) : "";
  return `${first}${last ?? ""}`.toUpperCase();
}

/** Look-up map from user id to personnel name, for rows that carry only an id. */
export function nameByUserId(
  members: (NamedMember & { user_id: string })[]
): Map<string, string> {
  return new Map(members.map((m) => [m.user_id, displayName(m)]));
}
