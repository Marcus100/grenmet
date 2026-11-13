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
  | "submit";

type Offered = Pick<CapAlertPublic, "allowed_actions">;

/** Whether the API offers this action on the alert. */
export function can(alert: Offered, action: CapAction): boolean {
  return (alert.allowed_actions ?? []).includes(action);
}

/** Whether the API offers any of these actions on the alert. */
export function canAny(alert: Offered, actions: readonly CapAction[]): boolean {
  return actions.some((action) => can(alert, action));
}
