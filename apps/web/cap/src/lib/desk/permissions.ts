/**
 * Which desk actions to offer. Display only: FastAPI checks every permission
 * again on each call, so a stale page can never grant anything.
 */
export interface DeskPermissions {
  approve: boolean;
  create: boolean;
  edit: boolean;
  emergencyPublish: boolean;
  publish: boolean;
  read: boolean;
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
    publish: has("cap.alert.publish"),
    read: has("cap.alert.read"),
    submit: has("cap.alert.submit"),
  };
}
