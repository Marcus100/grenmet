import type { ReactNode } from "react";

/**
 * The one navigation config. The sidebar, the search palette and the phone
 * tab bar all read it, so the three never disagree. The kit never decides who
 * may see an item: the app filters the config by role first (see
 * `filterNavigation`) and passes in what is left.
 */

/** A count ("3"), or a short word. Zero shows nothing. */
export type AdminNavBadge = number | "new" | "soon";

interface AdminNavItemBase {
  /**
   * Badge on the item. Pair a count with `badgeLabel` so assistive technology
   * hears what it counts ("3 waiting to be confirmed").
   */
  badge?: AdminNavBadge;
  badgeLabel?: string;
  disabled?: boolean;
  /**
   * An icon element, for example `<House />` from lucide-react. An element (not
   * a component) so a Server Component can pass the config to the shell.
   */
  icon?: ReactNode;
  /** Unique across the whole navigation, sub-items included. */
  id: string;
  newTab?: boolean;
  /**
   * A hint for the app's own filter (a permission key, a plan name). The kit
   * never reads it: `filterNavigation` hands it to the app's predicate.
   */
  requires?: string;
  title: string;
}

interface AdminNavMatch {
  /**
   * How the address is compared with `url`: "prefix" (default; `/people` is
   * current on `/people/42`) or "exact".
   */
  activeMatch?: "exact" | "prefix";
  /**
   * Overrides `activeMatch`. A function cannot cross from a Server Component
   * to the shell, so use it only when the config lives in a client module.
   */
  isActive?: (pathname: string) => boolean;
}

export interface AdminNavSubItem extends AdminNavItemBase, AdminNavMatch {
  url: string;
}

export interface AdminNavLinkItem extends AdminNavItemBase, AdminNavMatch {
  subItems?: never;
  /**
   * Shows on the phone bottom tab bar (the first four flagged items; the rest
   * stay under "More"). Only links qualify, not parents with sub-items.
   */
  tab?: boolean;
  url: string;
}

export interface AdminNavParentItem extends AdminNavItemBase {
  subItems: readonly AdminNavSubItem[];
  tab?: never;
  url?: never;
}

export type AdminNavItem = AdminNavLinkItem | AdminNavParentItem;

export interface AdminNavGroup {
  id: string;
  items: readonly AdminNavItem[];
  /** The group heading. Leave it out for an unlabelled group. */
  label?: string;
}

/** Most destinations the phone tab bar shows before "More". */
export const MAX_TAB_ITEMS = 4;

export function hasSubItems(item: AdminNavItem): item is AdminNavParentItem {
  return "subItems" in item && Boolean(item.subItems?.length);
}

const QUERY_OR_HASH = /[?#]/u;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

function stripQuery(url: string): string {
  const end = url.search(QUERY_OR_HASH);
  return end === -1 ? url : url.slice(0, end);
}

function isExternal(url: string): boolean {
  return SCHEME.test(url) || url.startsWith("//");
}

/** Length of the match between `url` and `pathname`, or -1 when none. */
function matchLength(
  entry: AdminNavMatch & { url: string },
  pathname: string
): number {
  if (isExternal(entry.url)) {
    return -1;
  }
  const base = stripQuery(entry.url);
  if (pathname === base) {
    return base.length;
  }
  const prefix = (entry.activeMatch ?? "prefix") === "prefix";
  if (prefix && base !== "/" && pathname.startsWith(`${base}/`)) {
    return base.length;
  }
  return -1;
}

/**
 * The ids of the items that are current at `pathname`. When several links
 * match (`/cap` and `/cap/settings` on `/cap/settings`), only the most
 * specific one is current, so two items are never highlighted for one page.
 * A parent is current when any of its sub-items is.
 */
export function getActiveIds(
  groups: readonly AdminNavGroup[],
  pathname: string
): ReadonlySet<string> {
  const custom: string[] = [];
  const matches: { id: string; length: number }[] = [];
  const parents: { id: string; children: readonly string[] }[] = [];

  const consider = (entry: AdminNavSubItem | AdminNavLinkItem) => {
    if (entry.isActive) {
      if (entry.isActive(pathname)) {
        custom.push(entry.id);
      }
      return;
    }
    const length = matchLength(entry, pathname);
    if (length >= 0) {
      matches.push({ id: entry.id, length });
    }
  };

  for (const group of groups) {
    for (const item of group.items) {
      if (hasSubItems(item)) {
        for (const sub of item.subItems) {
          consider(sub);
        }
        parents.push({
          id: item.id,
          children: item.subItems.map((sub) => sub.id),
        });
      } else if ("url" in item && item.url !== undefined) {
        consider(item);
      }
    }
  }

  const best = Math.max(-1, ...matches.map((match) => match.length));
  const active = new Set<string>(custom);
  for (const match of matches) {
    if (match.length === best) {
      active.add(match.id);
    }
  }
  for (const parent of parents) {
    if (parent.children.some((child) => active.has(child))) {
      active.add(parent.id);
    }
  }
  return active;
}

/** The items for the phone tab bar: flagged links, at most `MAX_TAB_ITEMS`. */
export function getTabItems(
  groups: readonly AdminNavGroup[]
): AdminNavLinkItem[] {
  const tabs: AdminNavLinkItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (!hasSubItems(item) && item.tab && !item.disabled) {
        tabs.push(item);
      }
    }
  }
  return tabs.slice(0, MAX_TAB_ITEMS);
}

/**
 * Keeps the items `allow` accepts, drops parents left without sub-items and
 * groups left without items. The app writes `allow` (usually from `requires`);
 * the kit only prunes.
 */
export function filterNavigation(
  groups: readonly AdminNavGroup[],
  allow: (item: AdminNavItem | AdminNavSubItem) => boolean
): AdminNavGroup[] {
  const result: AdminNavGroup[] = [];
  for (const group of groups) {
    const items: AdminNavItem[] = [];
    for (const item of group.items) {
      if (!allow(item)) {
        continue;
      }
      if (hasSubItems(item)) {
        const subItems = item.subItems.filter((sub) => allow(sub));
        if (subItems.length > 0) {
          items.push({ ...item, subItems });
        }
      } else {
        items.push(item);
      }
    }
    if (items.length > 0) {
      result.push({ ...group, items });
    }
  }
  return result;
}

export interface AdminSearchEntry {
  disabled?: boolean;
  group: string;
  icon?: ReactNode;
  id: string;
  label: string;
  newTab?: boolean;
  url: string;
}

/** Flattens the navigation into search entries (sub-items grouped under their parent). */
export function getSearchEntries(
  groups: readonly AdminNavGroup[],
  fallbackGroup = "Pages"
): AdminSearchEntry[] {
  const entries: AdminSearchEntry[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (hasSubItems(item)) {
        for (const sub of item.subItems) {
          entries.push({
            id: sub.id,
            group: item.title,
            label: sub.title,
            url: sub.url,
            icon: sub.icon ?? item.icon,
            disabled: sub.disabled || item.disabled,
            newTab: sub.newTab,
          });
        }
      } else if ("url" in item && item.url !== undefined) {
        entries.push({
          id: item.id,
          group: group.label ?? fallbackGroup,
          label: item.title,
          url: item.url,
          icon: item.icon,
          disabled: item.disabled,
          newTab: item.newTab,
        });
      }
    }
  }
  return entries;
}
