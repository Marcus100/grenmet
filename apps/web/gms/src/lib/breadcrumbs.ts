import {
  groupId,
  NAV_SECTIONS,
  type NavGroup,
  type NavLink,
  type NavSection,
} from "@/lib/nav-sections";

export interface Crumb {
  /** True for the page being viewed: rendered as text with aria-current. */
  current?: boolean;
  href: string;
  label: string;
}

interface NavEntry {
  group: NavGroup;
  link: NavLink;
  section: NavSection;
}

const NAV_ENTRIES: NavEntry[] = NAV_SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) =>
    group.links.map((link) => ({ group, link, section }))
  )
);

const TRAILING_SLASHES = /\/+$/;

function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navTrail(entry: NavEntry, current: boolean): Crumb[] {
  const { group, link, section } = entry;
  return [
    {
      href: section.href,
      label: section.label,
    },
    {
      href: `/sitemap#${groupId(section.label, group.heading)}`,
      label: group.heading,
    },
    { current, href: link.href, label: link.name },
  ];
}

/**
 * Breadcrumbs mirror the navigation's three levels: Section › Group › Page —
 * e.g. About › The service › About GMS. A page reached below a nav page (a
 * bulletin, an archive entry) shows its nav parent's trail, with the parent
 * linked; the page's own `h1` names it. Pages outside the navigation (privacy,
 * sitemap) get no trail.
 */
export function breadcrumbTrail(pathname: string): Crumb[] {
  const path = pathname.replace(TRAILING_SLASHES, "") || "/";
  if (path === "/") {
    return [];
  }

  const exact = NAV_ENTRIES.find((entry) => entry.link.href === path);
  if (exact) {
    return navTrail(exact, true);
  }

  const parent = NAV_ENTRIES.filter(
    (entry) => entry.link.href !== "/" && isWithin(path, entry.link.href)
  ).sort((a, b) => b.link.href.length - a.link.href.length)[0];
  if (parent) {
    return navTrail(parent, false);
  }
  return [];
}
