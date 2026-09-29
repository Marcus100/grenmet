export interface NavLink {
  /** One line, shown under the name in the sitemap and section pages. */
  description: string;
  href: string;
  name: string;
  /**
   * Not built yet. The planned-page route serves it as a sample-content
   * placeholder so the menu can show the full IA; see `plannedPage`.
   */
  planned?: boolean;
}

export interface NavGroup {
  heading: string;
  links: NavLink[];
}

/** Live card shown beside a section's links in the desktop menu. */
export type NavFeature =
  | { kind: "alerts" }
  | { kind: "forecast" }
  | {
      kind: "link";
      /** Short uppercase kicker, e.g. "For pilots". */
      eyebrow: string;
      href: string;
      cta: string;
      text: string;
    };

export interface NavSection {
  /** One sentence under the section name in the menu and on its index page. */
  blurb: string;
  featured: NavFeature;
  groups: NavGroup[];
  /** The section's URL root and index page. */
  href: string;
  label: string;
}

const link = (name: string, href: string, description: string): NavLink => ({
  name,
  href,
  description,
});

const planned = (name: string, href: string, description: string): NavLink => ({
  name,
  href,
  description,
  planned: true,
});

/**
 * Primary site navigation — seven sections, one URL root each (Bold sky IA,
 * 28 Sep 2026). Shared by the mobile drawer, the desktop mega menu, the
 * sitemap, breadcrumbs and section index pages so every surface stays in sync.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Alerts",
    href: "/alerts",
    blurb:
      "Official alerts, warnings and bulletins for Grenada, Carriacou and Petite Martinique.",
    featured: { kind: "alerts" },
    groups: [
      {
        heading: "In effect",
        links: [
          link(
            "Alerts in effect",
            "/alerts",
            "Current Outlooks, Watches and Warnings"
          ),
          link(
            "Advisories",
            "/alerts/advisories",
            "Lower-level notices in effect"
          ),
          link(
            "All bulletins",
            "/alerts/bulletins",
            "Detailed issued bulletins for nine hazards"
          ),
        ],
      },
      {
        heading: "Hazards",
        links: [
          link(
            "Tropical cyclone",
            "/alerts/cyclone",
            "Storm tracks, watches and warnings"
          ),
          link(
            "Flood & heavy rain",
            "/alerts/bulletins/flood",
            "Flood and heavy rain bulletins"
          ),
          link(
            "Thunderstorm",
            "/alerts/bulletins/thunderstorm",
            "Thunderstorm bulletins"
          ),
          link("Wind", "/alerts/bulletins/wind", "Strong wind bulletins"),
          link("Heat", "/alerts/bulletins/heat", "Heat bulletins"),
          link(
            "Marine",
            "/alerts/marine",
            "Small craft advisories and rough seas"
          ),
          link(
            "Coastal",
            "/alerts/bulletins/coastal",
            "High surf, swell and coastal flooding"
          ),
          link(
            "Saharan dust",
            "/alerts/bulletins/dust",
            "Dust and haze bulletins"
          ),
          link(
            "Tsunami",
            "/alerts/tsunami",
            "Threat levels, natural signs and what to do"
          ),
        ],
      },
      {
        heading: "Understand alerts",
        links: [
          link(
            "Warning levels",
            "/alerts/levels",
            "How the green-to-red scale works"
          ),
          link(
            "Impact-based warnings",
            "/alerts/impact",
            "What a warning means for you"
          ),
          link(
            "Reading a warning",
            "/alerts/understanding",
            "How to read a warning and act on it"
          ),
        ],
      },
      {
        heading: "Prepare",
        links: [
          link(
            "Hurricane",
            "/alerts/prepare/hurricane",
            "What every household should have ready"
          ),
          link(
            "Flood",
            "/alerts/prepare/flood",
            "Before, during and after heavy rain"
          ),
          planned(
            "Lightning",
            "/alerts/prepare/lightning",
            "Staying safe when thunder roars"
          ),
          planned(
            "Heat",
            "/alerts/prepare/heat",
            "Keeping cool on the hottest days"
          ),
          planned(
            "Tsunami",
            "/alerts/prepare/tsunami",
            "Know the signs and where to go"
          ),
        ],
      },
      {
        heading: "Get alerts",
        links: [
          link(
            "All alert channels",
            "/alerts/get-alerts",
            "Every channel alerts reach you through"
          ),
          link("GMS app", "/app-guide", "Warnings and forecasts on your phone"),
          planned(
            "CAP alerts",
            "/alerts/get-alerts/cap",
            "The machine-readable alert feed we publish"
          ),
        ],
      },
      {
        heading: "Archive",
        links: [
          link(
            "Tropical cyclone archive",
            "/alerts/cyclone/archive",
            "Past storms affecting the tri-island state"
          ),
          link(
            "Exercises & drills",
            "/alerts/exercise",
            "How test alerts are marked"
          ),
        ],
      },
    ],
  },
  {
    label: "Weather",
    href: "/weather",
    blurb: "Forecasts, what is happening now, maps and observations.",
    featured: { kind: "forecast" },
    groups: [
      {
        heading: "Forecasts",
        links: [
          link(
            "Today",
            "/weather",
            "Conditions, tides and sun times for today"
          ),
          link("3-day forecast", "/weather/3-day", "The next three days"),
          link("7-day forecast", "/weather/7-day", "The week ahead"),
          link(
            "Weather synopsis",
            "/weather/synopsis",
            "The forecaster's plain-language summary"
          ),
          link(
            "Nowcast",
            "/weather/nowcast",
            "Rain and wind over the next six hours"
          ),
          link(
            "Issued forecasts",
            "/weather/issued",
            "Morning, midday and evening reports"
          ),
        ],
      },
      {
        heading: "Right now",
        links: [
          link(
            "Current conditions",
            "/weather/conditions",
            "The latest observations from Point Salines"
          ),
          link("Radar", "/weather/radar", "Rainfall over Grenada right now"),
          link(
            "Satellite",
            "/weather/satellite",
            "Cloud and storms across the region"
          ),
          planned(
            "Lightning",
            "/weather/lightning",
            "Recent lightning strikes around the islands"
          ),
          planned(
            "Rainfall",
            "/weather/rainfall",
            "Rain totals from the last 24 hours"
          ),
        ],
      },
      {
        heading: "Tropical weather",
        links: [
          link(
            "Tropical weather outlook",
            "/weather/tropics",
            "NHC outlook for the Atlantic and Caribbean"
          ),
          planned(
            "Tropical waves",
            "/weather/tropics/waves",
            "Waves crossing the Atlantic towards us"
          ),
          planned(
            "Hurricane season",
            "/weather/tropics/season",
            "This season so far, and what to expect"
          ),
        ],
      },
      {
        heading: "Atmosphere",
        links: [
          link(
            "Saharan dust",
            "/weather/dust",
            "Five-day dust outlook and visibility"
          ),
          planned("UV index", "/weather/uv", "How strong the sun is today"),
          planned(
            "Heat index",
            "/weather/heat",
            "How hot it feels, and when to take care"
          ),
        ],
      },
      {
        heading: "Maps & models",
        links: [
          planned(
            "Interactive map",
            "/weather/map",
            "Satellite, radar, rain and wind on one map"
          ),
          link(
            "Model guidance",
            "/weather/models",
            "The numerical guidance behind the forecast"
          ),
          link(
            "Surface analysis",
            "/weather/analyses",
            "The features driving today's weather"
          ),
        ],
      },
      {
        heading: "Observations",
        links: [
          link(
            "All observations",
            "/weather/observations",
            "Latest readings from across the network"
          ),
          link(
            "Stations",
            "/weather/observations/stations",
            "Every station, what it measures and where"
          ),
          link(
            "Weather cameras",
            "/weather/observations/cameras",
            "Live views of sky and sea"
          ),
          link(
            "Water levels",
            "/weather/observations/water-levels",
            "River and coastal water level sensors"
          ),
          link(
            "Upper air",
            "/weather/observations/upper-air",
            "Soundings through the atmosphere"
          ),
          link(
            "School stations",
            "/weather/observations/school-stations",
            "Student-run stations in the network"
          ),
        ],
      },
      {
        heading: "Sun & sky",
        links: [
          link(
            "Sunrise, sunset and moon",
            "/weather/sun-and-sky",
            "Sun times, twilight and moon phase"
          ),
          planned(
            "Night sky",
            "/weather/sun-and-sky/night-sky",
            "What to look for after dark this month"
          ),
        ],
      },
    ],
  },
  {
    label: "Marine",
    href: "/marine",
    blurb: "Sea state, beaches, fishing, ocean and marine safety.",
    featured: {
      kind: "link",
      eyebrow: "Going on the water?",
      text: "Wind, sea state and swell for Grenada waters.",
      cta: "Marine forecast",
      href: "/marine/forecast",
    },
    groups: [
      {
        heading: "Forecasts",
        links: [
          link(
            "Marine forecast",
            "/marine/forecast",
            "Wind, sea state and swell for Grenada waters"
          ),
          link(
            "Coastal waters",
            "/marine/coastal",
            "Conditions by zone within 12 nautical miles"
          ),
          link(
            "Sea conditions",
            "/marine/sea-conditions",
            "Observed sea state around the islands"
          ),
          link(
            "Waves & swell",
            "/marine/wave-swell",
            "Significant height, period and direction"
          ),
          link("Tides", "/marine/tides", "Predicted high and low water"),
          link(
            "Nearshore wave model",
            "/marine/wave-model",
            "High-resolution wave modelling"
          ),
          link(
            "Small craft advisories",
            "/marine/small-craft",
            "Advisories in effect for small vessels"
          ),
        ],
      },
      {
        heading: "Beaches",
        links: [
          planned(
            "Beach conditions",
            "/marine/beaches",
            "Surf, UV and water quality at popular beaches"
          ),
        ],
      },
      {
        heading: "Fishing",
        links: [
          planned(
            "Fisher's forecast",
            "/marine/fishing",
            "Sea, wind and weather for a day's fishing"
          ),
        ],
      },
      {
        heading: "Ocean",
        links: [
          planned(
            "Sea temperature",
            "/marine/ocean/sea-temperature",
            "How warm the water is, and against normal"
          ),
          planned(
            "Coral heat stress",
            "/marine/ocean/coral",
            "Bleaching risk for Grenada's reefs"
          ),
        ],
      },
      {
        heading: "Sargassum",
        links: [
          planned(
            "Sargassum outlook",
            "/marine/sargassum",
            "Where seaweed may reach the coast"
          ),
        ],
      },
      {
        heading: "Safety",
        links: [
          link("Marine safety", "/marine/safety", "Staying safe on the water"),
          planned(
            "Rip currents",
            "/marine/safety/rip-currents",
            "Spotting and escaping a rip"
          ),
        ],
      },
    ],
  },
  {
    label: "Climate",
    href: "/climate",
    blurb: "Grenada's climate now, outlooks, data and records.",
    featured: {
      kind: "link",
      eyebrow: "Last month",
      text: "How last month's rain and temperature compared with normal.",
      cta: "Monthly summary",
      href: "/climate/monthly",
    },
    groups: [
      {
        heading: "Climate now",
        links: [
          link(
            "Monthly summary",
            "/climate/monthly",
            "How last month compared with normal"
          ),
          link(
            "Drought status",
            "/climate/drought",
            "Dry-spell status across the tri-island state"
          ),
          planned(
            "Climate dashboard",
            "/climate/dashboard",
            "Rain, temperature and sea at a glance"
          ),
        ],
      },
      {
        heading: "Outlooks",
        links: [
          link(
            "Seasonal outlook",
            "/climate/seasonal",
            "Rainfall and temperature for the months ahead"
          ),
          planned(
            "El Niño & La Niña",
            "/climate/enso",
            "How the Pacific shapes our seasons"
          ),
        ],
      },
      {
        heading: "Grenada's climate",
        links: [
          link(
            "Climate normals",
            "/climate/normals",
            "What a typical month looks like"
          ),
          planned(
            "Weather by month",
            "/climate/by-month",
            "What to expect each month of the year"
          ),
        ],
      },
      {
        heading: "Climate data",
        links: [
          link("Rainfall", "/climate/rainfall", "Monthly and daily totals"),
          link(
            "Temperature",
            "/climate/temperature",
            "Highs, lows and averages"
          ),
          link(
            "Historical data",
            "/climate/historical",
            "Past observations through the record"
          ),
          planned(
            "Records",
            "/climate/records",
            "Hottest, wettest and windiest on record"
          ),
        ],
      },
      {
        heading: "Climate change",
        links: [
          planned(
            "Grenada trends",
            "/climate/change",
            "How our climate is changing"
          ),
          planned(
            "Sea level",
            "/climate/change/sea-level",
            "Rising seas around the islands"
          ),
        ],
      },
      {
        heading: "Reports",
        links: [
          link(
            "Publications",
            "/climate/publications",
            "Reports, bulletins and studies"
          ),
          link(
            "Climate newsletter",
            "/climate/newsletter",
            "Monthly conditions and outlooks"
          ),
          link(
            "Product archive",
            "/climate/archive",
            "Past forecasts, warnings and bulletins"
          ),
          link(
            "Request data",
            "/climate/data-request",
            "Climate data for research or business"
          ),
        ],
      },
    ],
  },
  {
    label: "Services",
    href: "/services",
    blurb: "Specialist weather services for sectors and partners.",
    featured: {
      kind: "link",
      eyebrow: "For pilots",
      text: "Observations, terminal forecasts and briefings for TGPY and TGPZ.",
      cta: "Aviation weather",
      href: "/services/aviation",
    },
    groups: [
      {
        heading: "Aviation",
        links: [
          link(
            "Aviation weather",
            "/services/aviation",
            "Aerodromes, products and briefings"
          ),
          link(
            "METAR and TAF",
            "/services/aviation/metar-taf",
            "Current observations and terminal forecasts"
          ),
          link(
            "Flight winds",
            "/services/aviation/flight-winds",
            "Wind and temperature at flight levels"
          ),
          link(
            "Significant weather",
            "/services/aviation/sigwx",
            "Regional significant weather"
          ),
          link(
            "Pre-flight briefing",
            "/services/aviation/briefing",
            "The briefing service for operators"
          ),
        ],
      },
      {
        heading: "Agriculture",
        links: [
          link(
            "Agriculture weather",
            "/services/agriculture",
            "Rainfall and dry-spell outlooks for growers"
          ),
        ],
      },
      {
        heading: "Disaster management",
        links: [
          link(
            "Decision support",
            "/services/disaster-management",
            "Hazard briefings for planners and responders"
          ),
        ],
      },
      {
        heading: "Tourism & events",
        links: [
          link(
            "Visitor weather",
            "/services/tourism",
            "Planning weather for visitors"
          ),
          link(
            "Event forecasts",
            "/services/tourism/events",
            "Venue forecasts for Grenada's calendar"
          ),
        ],
      },
      {
        heading: "Health",
        links: [
          link(
            "Health weather",
            "/services/health",
            "Heat, dust and air-quality guidance"
          ),
        ],
      },
      {
        heading: "More services",
        links: [
          link(
            "Construction",
            "/services/construction",
            "Wind and rain windows for site planning"
          ),
          link(
            "Education",
            "/services/education",
            "Weather resources for schools"
          ),
          link(
            "Media",
            "/services/media",
            "Broadcast-ready data, graphics and interviews"
          ),
          planned(
            "Data & API",
            "/services/data",
            "Machine-readable forecasts and observations"
          ),
        ],
      },
    ],
  },
  {
    label: "Learn & Explore",
    href: "/explore",
    blurb:
      "Stories and explainers about Grenada's weather, ocean, climate and sky.",
    featured: {
      kind: "link",
      eyebrow: "Explained by GMS",
      text: "Plain-language answers to questions about Grenada's weather.",
      cta: "Read the explainers",
      href: "/explore/explained",
    },
    groups: [
      {
        heading: "Earth & Weather",
        links: [
          link(
            "Latest news",
            "/explore/news",
            "Stories from the forecast desk"
          ),
          link(
            "Product updates",
            "/explore/updates",
            "Changes to our forecasts and services"
          ),
        ],
      },
      {
        heading: "Explained by GMS",
        links: [
          link(
            "All explainers",
            "/explore/explained",
            "Grenada's weather and climate, explained"
          ),
          planned(
            "Ask a meteorologist",
            "/explore/ask",
            "Send us a question about the weather"
          ),
        ],
      },
      {
        heading: "Weather history",
        links: [
          planned(
            "Historic hurricanes",
            "/explore/history/hurricanes",
            "Janet, Ivan, Emily, Beryl and more"
          ),
          link(
            "Hurricane names",
            "/explore/hurricane-names",
            "How storms are named and names retired"
          ),
        ],
      },
      {
        heading: "Behind the forecast",
        links: [
          planned(
            "How forecasts are made",
            "/explore/how-forecasts-are-made",
            "From observation to bulletin"
          ),
        ],
      },
      {
        heading: "Schools & kids",
        links: [
          link(
            "School resources",
            "/explore/school",
            "Lesson material about Grenada's weather"
          ),
        ],
      },
      {
        heading: "Interactive",
        links: [
          planned(
            "Weather quiz",
            "/explore/quiz",
            "Test what you know about the weather"
          ),
          link("Glossary", "/explore/glossary", "The terms we use"),
          link("FAQs", "/explore/faqs", "Common questions about our services"),
          link(
            "Downloads",
            "/explore/downloads",
            "Forms, posters and guides to keep"
          ),
        ],
      },
    ],
  },
  {
    label: "About",
    href: "/about",
    blurb:
      "The Grenada Meteorological Service, its people, network and partners.",
    featured: {
      kind: "link",
      eyebrow: "Forecast office",
      text: "Open 24 hours at Maurice Bishop International Airport.",
      cta: "Contact GMS",
      href: "/about/contact",
    },
    groups: [
      {
        heading: "About GMS",
        links: [
          link("What we do", "/about", "Who we are and what we do"),
          link(
            "Our services",
            "/about/services",
            "The full range of services we provide"
          ),
          link(
            "Our history",
            "/about/history",
            "How meteorology in Grenada developed"
          ),
          link("Careers", "/about/careers", "Working at GMS"),
          link(
            "Contact",
            "/about/contact",
            "Enquiries, media and data requests"
          ),
        ],
      },
      {
        heading: "Observing network",
        links: [
          link(
            "Observing network",
            "/about/network",
            "Where our observations come from"
          ),
        ],
      },
      {
        heading: "Standards & partners",
        links: [
          link(
            "Standards and partners",
            "/about/standards",
            "WMO, ICAO and regional cooperation"
          ),
          link(
            "Regional weather",
            "/about/regional",
            "Neighbouring services and regional centres"
          ),
        ],
      },
      {
        heading: "Performance",
        links: [
          planned(
            "Forecast accuracy",
            "/about/performance",
            "How well our forecasts verify"
          ),
        ],
      },
      {
        heading: "Help",
        links: [
          link("Website help", "/help", "How to read this site"),
          link("Accessibility", "/accessibility", "Using this site your way"),
        ],
      },
    ],
  },
];

/** Every link in a section, in order — what the mobile drawer lists. */
export function sectionLinks(section: NavSection): NavLink[] {
  return section.groups.flatMap((group) => group.links);
}

/** Every planned (not yet built) link, keyed by path, with its section. */
export function plannedPage(
  path: string
): { link: NavLink; section: NavSection } | undefined {
  for (const section of NAV_SECTIONS) {
    const found = sectionLinks(section).find(
      (entry) => entry.planned && entry.href === path
    );
    if (found) {
      return { link: found, section };
    }
  }
  return undefined;
}

/** Paths the planned-page route renders. */
export function plannedPaths(): string[] {
  return NAV_SECTIONS.flatMap((section) =>
    sectionLinks(section)
      .filter((entry) => entry.planned)
      .map((entry) => entry.href)
  );
}

const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-|-$/g;

const toSlug = (text: string) =>
  text.toLowerCase().replace(NON_SLUG_CHARS, "-").replace(EDGE_DASHES, "");

/** Stable anchor for a section on the sitemap page, e.g. "Weather" → "weather". */
export function sectionId(label: string): string {
  return toSlug(label);
}

/** Stable sitemap anchor for a group, e.g. About / "About GMS" → "about--about-gms". */
export function groupId(sectionLabel: string, heading: string): string {
  return `${toSlug(sectionLabel)}--${toSlug(heading)}`;
}
