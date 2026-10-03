export interface SectionMeta {
  description: string;
  label: string;
  navLabel: string;
  slug: string;
}
export const SECTIONS: readonly SectionMeta[] = [
  {
    slug: "news-community",
    label: "News & Community",
    navLabel: "News",
    description:
      "The decisions, people and everyday changes shaping our parishes.",
  },
  {
    slug: "opportunity",
    label: "Money & Opportunity",
    navLabel: "Opportunity",
    description: "Work, business, scholarships and the cost of everyday life.",
  },
  {
    slug: "culture-life",
    label: "Culture & Entertainment",
    navLabel: "Entertainment",
    description:
      "Music, Carnival, film, food and the people shaping culture — here and beyond.",
  },
  {
    slug: "sport",
    label: "Sport",
    navLabel: "Sport",
    description:
      "Grenadian athletes, Caribbean rivalries and the games the world is watching.",
  },
  {
    slug: "weather-ready",
    label: "Weather & Environment",
    navLabel: "Weather",
    description: "Weather, land and sea, with context for the choices we make.",
  },
  {
    slug: "check-d-ting",
    label: "Fact Check",
    navLabel: "Fact Check",
    description:
      "A closer look at the claims being shared, and the evidence behind them.",
  },
  {
    slug: "grenada-world",
    label: "Caribbean & World",
    navLabel: "The World",
    description:
      "The big stories and discoveries across the Caribbean and around the world.",
  },
];
export const SERIES = [
  {
    label: "Daily Signal",
    href: "/briefs",
    description: "A concise briefing to start with the essentials.",
  },
  {
    label: "Parish Pulse",
    href: "/news-community",
    description: "Community life, parish by parish.",
  },
  {
    label: "Check D Ting",
    href: "/check-d-ting",
    description: "Before you share it, check it.",
  },
  {
    label: "Opportunities",
    href: "/opportunity",
    description: "Scholarships, work and funding worth a look.",
  },
];
export const NAV_LINKS = [
  { label: "Latest", href: "/" },
  { label: "News", href: "/news-community" },
  { label: "Entertainment", href: "/culture-life" },
  { label: "Sport", href: "/sport" },
  { label: "Money", href: "/opportunity" },
  { label: "Caribbean & World", href: "/grenada-world" },
  { label: "All topics", href: "/topics" },
  { label: "Guides & explainers", href: "/learn" },
  { label: "Archive", href: "/archive" },
  { label: "Search", href: "/search" },
];
export function getSection(slug: string): SectionMeta | undefined {
  return SECTIONS.find((section) => section.slug === slug);
}
