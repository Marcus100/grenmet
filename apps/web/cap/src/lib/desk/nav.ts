import type { Route } from "next";
import type { DeskPermissions } from "./permissions";

export interface DeskNavItem {
  href: Route;
  label: string;
  /** Shown only when this returns true; no entry means every signed-in staff member. */
  need?: (permissions: DeskPermissions) => boolean;
}

/**
 * The desk's menu, in display order. Display only: every page and FastAPI
 * still check their own permissions.
 */
export const DESK_NAV_ITEMS: readonly DeskNavItem[] = [
  { href: "/desk", label: "Board" },
  { href: "/desk/new", label: "New warning", need: (p) => p.create },
  { href: "/desk/escalations", label: "GMS alerts", need: (p) => p.create },
  { href: "/desk/areas", label: "Areas", need: (p) => p.read },
  { href: "/desk/audit", label: "Audit", need: (p) => p.read },
  { href: "/desk/statistics", label: "Statistics", need: (p) => p.read },
  { href: "/desk/feeds", label: "Feeds", need: (p) => p.feedsManage },
  {
    href: "/desk/integrations",
    label: "Integrations",
    need: (p) => p.integrationsManage,
  },
  { href: "/desk/settings", label: "Settings", need: (p) => p.settingsManage },
  { href: "/desk/matrix", label: "Impact matrix" },
  { href: "/desk/profiles", label: "Hazard profiles" },
  { href: "/desk/import", label: "Import", need: (p) => p.create },
  { href: "/", label: "Public alerts" },
];

/** The menu items this account may see, in the same order. */
export function deskNavItems(
  permissions: DeskPermissions,
  items: readonly DeskNavItem[] = DESK_NAV_ITEMS
): DeskNavItem[] {
  return items.filter((item) => !item.need || item.need(permissions));
}
