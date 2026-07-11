/**
 * Information architecture for the GAA site.
 *
 * Content sections map 1:1 to `content/<section>/` MDX folders; nav groups
 * are the header dropdowns. Task-based grouping (what a passenger is trying
 * to do), not the org chart.
 */

export const SECTIONS = [
  "travel",
  "at-the-airport",
  "business",
  "corporate",
  "development",
  "news",
] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  travel: "Travel Guide",
  "at-the-airport": "At the Airport",
  business: "Business",
  corporate: "Corporate",
  development: "Development",
  news: "News & Media",
};

export const SECTION_DESCRIPTIONS: Record<Section, string> = {
  travel:
    "Everything you need before you fly — check-in, baggage, immigration, customs, health and travel tips.",
  "at-the-airport":
    "Lounges, dining, shopping, services and maps across our terminals.",
  business:
    "Aviation support services, fees and charges, cargo, advertising and event spaces.",
  corporate:
    "The Grenada Airports Authority — who we are, leadership, careers, sustainability and community.",
  development:
    "Building the future of Grenada's airports — plans, ongoing projects and recent completions.",
  news: "Latest news, press releases and media resources from the GAA.",
};

export interface NavLink {
  href: string;
  label: string;
}

export interface NavGroup {
  href: string;
  label: string;
  links: NavLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Travel Guide",
    href: "/travel",
    links: [
      { label: "Check-in Procedures", href: "/travel/check-in-procedures" },
      { label: "Baggage Policies", href: "/travel/baggage-policies" },
      {
        label: "Visa & Immigration",
        href: "/travel/visa-immigration-guidelines",
      },
      {
        label: "Customs & Duty-Free",
        href: "/travel/customs-duty-free-regulations",
      },
      { label: "Health & Safety", href: "/travel/health-safety-protocols" },
      { label: "Flying with Pets", href: "/travel/flying-with-pets" },
      { label: "Ground Transportation", href: "/travel/ground-transportation" },
      { label: "Parking at MBIA", href: "/travel/parking-at-mbia" },
      { label: "Travel Tips & FAQs", href: "/travel/travel-tips-faqs" },
    ],
  },
  {
    label: "At the Airport",
    href: "/at-the-airport",
    links: [
      { label: "Lounges", href: "/at-the-airport/airport-lounges" },
      { label: "Dine", href: "/at-the-airport/dine" },
      { label: "Shopping", href: "/at-the-airport/shopping" },
      {
        label: "Services & Amenities",
        href: "/at-the-airport/services-amenities",
      },
      {
        label: "Fast Track & Meet-and-Greet",
        href: "/at-the-airport/fast-track-meet-greet",
      },
      { label: "Terminal Map", href: "/at-the-airport/terminal-map" },
      { label: "Lost & Found", href: "/travel/lost-and-found" },
    ],
  },
  {
    label: "Our Airports",
    href: "/airports",
    links: [
      { label: "Maurice Bishop International", href: "/airports/mbia" },
      { label: "Lauriston Airport (Carriacou)", href: "/airports/lauriston" },
      { label: "Pearls Airport (Historic)", href: "/airports/pearls" },
    ],
  },
  {
    label: "Business",
    href: "/business",
    links: [
      {
        label: "Aviation Support Services",
        href: "/business/aviation-support-services",
      },
      {
        label: "Air Service Development",
        href: "/business/air-service-development",
      },
      { label: "Aeronautical Fees", href: "/business/aeronautical-fee" },
      {
        label: "Non-Aeronautical Fees",
        href: "/business/non-aeronautical-fee",
      },
      { label: "Air Cargo Services", href: "/business/air-cargo-services" },
      {
        label: "Advertising & Promotions",
        href: "/business/advertising-promotions",
      },
      {
        label: "Meeting & Event Spaces",
        href: "/business/meeting-events-spaces",
      },
    ],
  },
  {
    label: "Corporate",
    href: "/corporate",
    links: [
      { label: "About the GAA", href: "/corporate/about-gaa" },
      {
        label: "Leadership & Governance",
        href: "/corporate/leadership-governance",
      },
      { label: "Board of Directors", href: "/corporate/board-of-directors" },
      {
        label: "Careers & Opportunities",
        href: "/corporate/careers-opportunities",
      },
      {
        label: "Sustainability & Community",
        href: "/corporate/sustainability-community",
      },
      { label: "News & Media", href: "/news" },
      { label: "Development Projects", href: "/development" },
    ],
  },
];

/** Quick-task tiles under the homepage hero. */
export const QUICK_TASKS: (NavLink & { description: string })[] = [
  {
    label: "Arrivals",
    href: "/flights?board=arrivals",
    description: "Live arrival status at MBIA and Lauriston",
  },
  {
    label: "Departures",
    href: "/flights?board=departures",
    description: "Departure times, gates and check-in",
  },
  {
    label: "Getting Here",
    href: "/travel/ground-transportation",
    description: "Taxis, buses, car rental and parking",
  },
  {
    label: "Lounges",
    href: "/at-the-airport/airport-lounges",
    description: "Executive, VIP diplomatic and jet-centre lounges",
  },
];
