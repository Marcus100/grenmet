export interface NavLink {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

/** A top-level entry: a single page, or a menu of links. */
export type NavItem = NavGroup | NavLink;

export function isGroup(item: NavItem): item is NavGroup {
  return "links" in item;
}

/**
 * The site map, shared by the desktop bar and the phone menu. Task words a
 * reader would use, as election hubs do; less-used pages sit under More.
 * The wordmark goes to the front page.
 * "Find your constituency" is the search box, not a menu item.
 */
export const NAV: NavItem[] = [
  { href: "/2026", label: "Election 2026" },
  { href: "/candidates", label: "Candidates" },
  { href: "/forecast", label: "Forecast" },
  { href: "/make-your-map", label: "Make your map" },
  { href: "/results", label: "Results" },
  { href: "/constituencies", label: "Constituencies" },
  {
    label: "More",
    links: [
      { href: "/since-2022", label: "Since the 2022 election" },
      { href: "/elections", label: "Every election" },
      { href: "/referendums", label: "Referendums" },
      { href: "/parties", label: "Parties" },
      { href: "/trends", label: "Trends" },
      { href: "/how-close", label: "How close was it?" },
      { href: "/register", label: "Voter register" },
      { href: "/sources", label: "Sources" },
    ],
  },
];

/** Whether a link is the page being shown (or a page below it). */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The group holding the current page, so the phone menu opens on it. */
export function currentGroup(pathname: string): string | undefined {
  return NAV.find(
    (item) =>
      isGroup(item) && item.links.some((link) => isCurrent(link.href, pathname))
  )?.label;
}
