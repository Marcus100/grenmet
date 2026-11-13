import { describe, expect, it } from "vitest";
import { deskPermissions } from "./permissions";

describe("deskPermissions", () => {
  it("maps each admin screen to the key the API enforces", () => {
    const perms = deskPermissions({
      is_superuser: false,
      permission_keys: [
        "cap.alert.read",
        "cap.settings.manage",
        "cap.feed.manage",
      ],
    });
    expect(perms.read).toBe(true);
    expect(perms.settingsManage).toBe(true);
    expect(perms.feedsManage).toBe(true);
    expect(perms.integrationsManage).toBe(false);
    expect(perms.publish).toBe(false);
  });

  it("gives a superuser every permission", () => {
    const perms = deskPermissions({ is_superuser: true, permission_keys: [] });
    expect(perms.integrationsManage).toBe(true);
    expect(perms.settingsManage).toBe(true);
  });
});
