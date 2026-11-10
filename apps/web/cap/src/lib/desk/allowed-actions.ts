import type { CapAlertPublic } from "@barrelsgd/api-client";

/**
 * Lifecycle actions the API can offer on a saved alert (`allowed_actions`,
 * from `apps/api/fastapi/src/cap/transitions.py`). The API decides them from
 * the state alone; permissions and policy are still checked on every call.
 */
export type CapAction =
  | "approve"
  | "cancel"
  | "emergency_publish"
  | "expire"
  | "publish"
  | "revert_to_draft"
  | "submit";

type Offered = Pick<CapAlertPublic, "allowed_actions" | "lifecycle_state">;

/** Whether the API offers this action on the alert. */
export function can(alert: Offered, action: CapAction): boolean {
  return (alert.allowed_actions ?? []).includes(action);
}

/** Whether the API offers any of these actions on the alert. */
export function canAny(alert: Offered, actions: readonly CapAction[]): boolean {
  return actions.some((action) => can(alert, action));
}

/** Saving an edit to a submitted or approved alert sends it back to DRAFT. */
// The API does not offer `revert_to_draft` (it happens as a side effect of an
// edit, so it is not in OFFERED_ACTIONS). Until it is offered, these two
// states stay editable here, so the Edit link does not disappear.
const EDIT_REVERTS_TO_DRAFT = new Set(["SUBMITTED", "APPROVED"]);

/** Whether the desk can open the editor for this alert. */
export function isEditable(alert: Offered): boolean {
  return (
    can(alert, "revert_to_draft") ||
    alert.lifecycle_state === "DRAFT" ||
    EDIT_REVERTS_TO_DRAFT.has(alert.lifecycle_state)
  );
}
