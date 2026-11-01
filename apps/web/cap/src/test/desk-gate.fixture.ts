import type { DeskGate } from "@/lib/desk/gate";
import type { DeskPermissions } from "@/lib/desk/permissions";

export const ALL_PERMISSIONS: DeskPermissions = {
  approve: true,
  create: true,
  edit: true,
  emergencyPublish: true,
  feedsManage: true,
  integrationsManage: true,
  publish: true,
  read: true,
  settingsManage: true,
  submit: true,
};

export const NO_ADMIN_PERMISSIONS: DeskPermissions = {
  ...ALL_PERMISSIONS,
  feedsManage: false,
  integrationsManage: false,
  settingsManage: false,
};

/** A signed-in staff gate. Pass overrides to remove a permission. */
export function staffGate(
  permissions: Partial<DeskPermissions> = {}
): Extract<DeskGate, { status: "staff" }> {
  return {
    accessToken: "token-test",
    email: "forecaster@example.test",
    name: "Forecaster",
    permissions: { ...ALL_PERMISSIONS, ...permissions },
    status: "staff",
    userId: "11111111-1111-4111-8111-111111111111",
  };
}
