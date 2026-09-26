import {
  groupId,
  NAV_SECTIONS,
  type NavGroup,
  type NavLink,
  type NavSection,
  sectionId,
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

/**
 * Routes outside the navigation whose parent is a nav page. `/bulletins/<hazard>`
 * has no index of its own; its listing is the Bulletins nav page.
 */
const PARENT_OVERRIDES: Record<string, string> = {
  "/bulletins": "/products/bulletins",
};

/** Listing pages that are not in the navigation but parent dated content. */
const STANDALONE_PARENTS: Record<string, string> = {
  "/news": "News",
  "/warnings": "Warnings in effect",
  "/updates": "Product updates",
};

const TRAILING_SLASHES = /\/+$/;

function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navTrail(entry: NavEntry, current: boolean): Crumb[] {
  const { group, link, section } = entry;
  return [
    {
      href: section.href ?? `/sitemap#${sectionId(section.label)}`,
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

  const segments = path.split("/").filter(Boolean);
  const [first] = segments;
  const overridden = first ? PARENT_OVERRIDES[`/${first}`] : undefined;
  const lookup = overridden
    ? `${overridden}/${segments.slice(1).join("/")}`
    : path;
  const parent = NAV_ENTRIES.filter(
    (entry) => entry.link.href !== "/" && isWithin(lookup, entry.link.href)
  ).sort((a, b) => b.link.href.length - a.link.href.length)[0];
  if (parent) {
    return navTrail(parent, false);
  }

  const standalone = first ? STANDALONE_PARENTS[`/${first}`] : undefined;
  if (standalone && segments.length > 1) {
    return [{ href: `/${first}`, label: standalone }];
  }
  return [];
}
