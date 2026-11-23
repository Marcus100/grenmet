/**
 * Readable wording for the audit trail. The API gives only a user id (no
 * display name or email), so the actor is a neutral label, never the raw id.
 */

export const STAFF_ACTOR_LABEL = "Staff member";
export const SYSTEM_ACTOR_LABEL = "System";

/** A signed-in staff member's id reads as "Staff member"; no actor is "System". */
export function auditActorLabel(
  actorUserId: string | null | undefined
): string {
  return actorUserId ? STAFF_ACTOR_LABEL : SYSTEM_ACTOR_LABEL;
}

/** "PENDING_REVIEW" -> "Pending review" (sentence case, underscores as spaces). */
export function auditStateLabel(state: string): string {
  const words = state.replace(/_/gu, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The state change in words, e.g. "Draft → Published" or "Created as a draft". */
export function auditTransitionLabel(
  previousState: string | null | undefined,
  nextState: string | null | undefined
): string {
  if (!nextState) {
    return previousState
      ? `${auditStateLabel(previousState)} (no new state recorded)`
      : "No state recorded";
  }
  if (!previousState) {
    return nextState === "DRAFT"
      ? "Created as a draft"
      : `Created as ${auditStateLabel(nextState).toLowerCase()}`;
  }
  return `${auditStateLabel(previousState)} → ${auditStateLabel(nextState)}`;
}
