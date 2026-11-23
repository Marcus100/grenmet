import { describe, expect, it } from "vitest";
import { DESK_NAV_ITEMS, deskNavItems } from "./nav";
import type { DeskPermissions } from "./permissions";

const NONE: DeskPermissions = {
  approve: false,
  create: false,
  edit: false,
  emergencyPublish: false,
  feedsManage: false,
  integrationsManage: false,
  libraryManage: false,
  publish: false,
  read: false,
  settingsManage: false,
  submit: false,
};

const ALL: DeskPermissions = {
  approve: true,
  create: true,
  edit: true,
  emergencyPublish: true,
  feedsManage: true,
  integrationsManage: true,
  libraryManage: true,
  publish: true,
  read: true,
  settingsManage: true,
  submit: true,
};

function labels(permissions: DeskPermissions): string[] {
  return deskNavItems(permissions).map((item) => item.label);
}

describe("desk menu", () => {
  it("lists all 13 items in display order for an account with every permission", () => {
    expect(labels(ALL)).toEqual([
      "Board",
      "New warning",
      "GMS alerts",
      "Areas",
      "Audit",
      "Statistics",
      "Feeds",
      "Integrations",
      "Settings",
      "Impact matrix",
      "Hazard profiles",
      "Import",
      "Public alerts",
    ]);
    expect(DESK_NAV_ITEMS).toHaveLength(13);
  });

  it("shows only the always-on items to a signed-in account with no CAP permission", () => {
    expect(labels(NONE)).toEqual([
      "Board",
      "Impact matrix",
      "Hazard profiles",
      "Public alerts",
    ]);
  });

  it("gates the create items on cap.alert.create", () => {
    expect(labels({ ...NONE, create: true })).toEqual([
      "Board",
      "New warning",
      "GMS alerts",
      "Impact matrix",
      "Hazard profiles",
      "Import",
      "Public alerts",
    ]);
  });

  it("gates the read items on cap.alert.read", () => {
    expect(labels({ ...NONE, read: true })).toEqual([
      "Board",
      "Areas",
      "Audit",
      "Statistics",
      "Impact matrix",
      "Hazard profiles",
      "Public alerts",
    ]);
  });

  it("gates feeds, integrations and settings on their own permissions", () => {
    expect(
      labels({
        ...NONE,
        feedsManage: true,
        integrationsManage: true,
        settingsManage: true,
      })
    ).toEqual([
      "Board",
      "Feeds",
      "Integrations",
      "Settings",
      "Impact matrix",
      "Hazard profiles",
      "Public alerts",
    ]);
  });

  it("has a unique href for every item, so the links can be keyed", () => {
    const hrefs = DESK_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the board first and the public site last", () => {
    expect(DESK_NAV_ITEMS[0]?.href).toBe("/desk");
    expect(DESK_NAV_ITEMS.at(-1)?.href).toBe("/");
  });
});
