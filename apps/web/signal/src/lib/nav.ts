export interface SectionMeta {
  description: string;
  label: string;
  navLabel: string;
  slug: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  {
    slug: "weather-ready",
    label: "Weather Ready",
    navLabel: "Weather",
    description:
      "Today's forecast, rain and marine risk, and what it means for your day — at home, at sea, and in the garden.",
  },
  {
    slug: "check-d-ting",
    label: "Check D Ting",
    navLabel: "Check D Ting",
    description:
      "We check the WhatsApp, Facebook, and radio claims going around — so you know what's real before you share.",
  },
  {
    slug: "opportunity",
    label: "Opportunity Watch",
    navLabel: "Opportunity",
    description:
      "Jobs, scholarships, grants, and tenders worth knowing about — with deadlines and how to apply.",
  },
] as const;

export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Today", href: "/" },
  { label: "Weather", href: "/weather-ready" },
  { label: "Check D Ting", href: "/check-d-ting" },
  { label: "Opportunity", href: "/opportunity" },
  { label: "Podcast", href: "/#podcast" },
  { label: "Watch", href: "/#watch" },
] as const;

export function getSection(slug: string): SectionMeta | undefined {
  return SECTIONS.find((section) => section.slug === slug);
}
