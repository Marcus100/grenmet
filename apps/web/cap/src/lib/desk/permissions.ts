/**
 * Which desk actions to offer. Display only: FastAPI checks every permission
 * again on each call, so a stale page can never grant anything.
 */
export interface DeskPermissions {
  approve: boolean;
  create: boolean;
  edit: boolean;
  emergencyPublish: boolean;
  /** `cap.feed.manage`: list, add, change and delete external feed sources. */
  feedsManage: boolean;
  /** `cap.integrations.manage`: read the integrations status page. */
  integrationsManage: boolean;
  libraryManage: boolean;
  publish: boolean;
  read: boolean;
  /**
   * `cap.settings.manage`: read and change CAP sender settings, and save
   * predefined areas (the API uses the same key for both).
   */
  settingsManage: boolean;
  submit: boolean;
}

interface Access {
  is_superuser: boolean;
  permission_keys: readonly string[];
}

export function deskPermissions(access: Access): DeskPermissions {
  const has = (key: string) =>
    access.is_superuser || access.permission_keys.includes(key);
  return {
    approve: has("cap.alert.approve"),
    create: has("cap.alert.create"),
    edit: has("cap.alert.edit"),
    emergencyPublish: has("cap.alert.publish_emergency"),
    feedsManage: has("cap.feed.manage"),
    integrationsManage: has("cap.integrations.manage"),
    libraryManage: has("cap.library.manage"),
    publish: has("cap.alert.publish"),
    read: has("cap.alert.read"),
    settingsManage: has("cap.settings.manage"),
    submit: has("cap.alert.submit"),
  };
}
