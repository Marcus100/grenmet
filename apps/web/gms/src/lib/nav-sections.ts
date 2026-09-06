export interface NavLink {
  /** One line, shown under the name in the desktop panel. */
  description: string;
  href: string;
  name: string;
}

export interface NavGroup {
  heading: string;
  links: NavLink[];
}

/** Live card shown beside a section's links in the desktop panel. */
export type NavFeature = "alerts" | "forecast";

export interface NavSection {
  featured?: NavFeature;
  groups: NavGroup[];
  /** A section with no groups is a plain link. */
  href?: string;
  label: string;
}

/**
 * Primary site navigation, shared by the mobile nav drawer and the desktop
 * masthead panels so both surfaces stay in sync from one source. The drawer
 * flattens groups with `sectionLinks`.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Warnings",
    featured: "alerts",
    groups: [
      {
        heading: "In effect",
        links: [
          {
            name: "Current alerts",
            href: "/warnings",
            description: "Every warning in effect right now, by hazard",
          },
          {
            name: "Weather Advisories",
            href: "/warnings/advisories",
            description: "Lower-level notices worth planning around",
          },
          {
            name: "Impact-Based Warnings",
            href: "/warnings/impact",
            description: "What a warning means for you, not just the weather",
          },
        ],
      },
      {
        heading: "By hazard",
        links: [
          {
            name: "Tropical Cyclone Information",
            href: "/warnings/cyclone",
            description:
              "Storm tracks, watches and warnings for the tri-island state",
          },
          {
            name: "Marine Warnings",
            href: "/warnings/marine",
            description: "Small craft advisories and rough-sea notices",
          },
        ],
      },
      {
        heading: "Understand",
        links: [
          {
            name: "Warning Levels Explained",
            href: "/warnings/levels",
            description: "How the green-to-red warning scale works",
          },
        ],
      },
    ],
  },
  {
    label: "Forecasts",
    featured: "forecast",
    groups: [
      {
        heading: "Daily",
        links: [
          {
            name: "Today's Forecast",
            href: "/",
            description: "Conditions, tides and sun times for today",
          },
          {
            name: "3-Day Forecast",
            href: "/forecasts/3-day",
            description: "The next three days at a glance",
          },
          {
            name: "7-Day Outlook",
            href: "/forecasts/7-day",
            description: "The week ahead, updated each morning",
          },
          {
            name: "Weather Synopsis",
            href: "/forecasts/synopsis",
            description: "The forecaster's plain-language summary",
          },
        ],
      },
      {
        heading: "Live",
        links: [
          {
            name: "Radar",
            href: "/forecasts/radar",
            description: "Rainfall over Grenada right now",
          },
          {
            name: "Satellite",
            href: "/forecasts/satellite",
            description: "Cloud and storms across the region",
          },
          {
            name: "Current Conditions",
            href: "/forecasts/conditions",
            description: "The latest observations from Point Salines",
          },
        ],
      },
    ],
  },
  // {
  //   label: "Marine",
  //   links: [
  //     { name: "Marine Forecast", href: "/marine/forecast" },
  //     { name: "Coastal Waters Forecast", href: "/marine/coastal" },
  //     { name: "Sea Conditions", href: "/marine/sea-conditions" },
  //     { name: "Wave / Swell Forecast", href: "/marine/wave-swell" },
  //     { name: "Tide Information", href: "/marine/tides" },
  //     { name: "Small Craft Advisories", href: "/marine/small-craft" },
  //     { name: "Marine Safety", href: "/marine/safety" },
  //   ],
  // },
  {
    label: "Sectors",
    groups: [
      {
        heading: "Safety and operations",
        links: [
          {
            name: "Aviation",
            href: "/sectors/aviation",
            description:
              "Terminal forecasts and briefings for pilots and airlines",
          },
          {
            name: "Disaster Management",
            href: "/sectors/disaster-management",
            description:
              "Hazard briefings for emergency planners and responders",
          },
          {
            name: "Marine",
            href: "/sectiors/marine",
            description: "Sea state and swell for fishers, sailors and ports",
          },
        ],
      },
      {
        heading: "Industry and community",
        links: [
          {
            name: "Agriculture",
            href: "/sectors/agriculture",
            description: "Rainfall and dry-spell outlooks for growers",
          },
          {
            name: "Tourism & Events",
            href: "/sectors/tourism",
            description: "Planning weather for visitors and outdoor events",
          },
          {
            name: "Construction",
            href: "/sectors/construction",
            description: "Wind and rain windows for site planning",
          },
          {
            name: "Education",
            href: "/sectors/education",
            description: "Weather resources for schools and students",
          },
          {
            name: "Health",
            href: "/sectors/health",
            description: "Heat, dust and air-quality guidance",
          },
        ],
      },
    ],
  },
  {
    label: "Climate & Data",
    groups: [
      {
        heading: "Data",
        links: [
          {
            name: "Rainfall Data",
            href: "/climate/rainfall",
            description: "Monthly and daily totals by station",
          },
          {
            name: "Temperature Data",
            href: "/climate/temperature",
            description: "Highs, lows and averages by station",
          },
          {
            name: "Historical Weather Data",
            href: "/climate/historical",
            description: "Past observations back through the record",
          },
          {
            name: "Climate Normals",
            href: "/climate/normals",
            description: "What a typical month looks like in Grenada",
          },
        ],
      },
      {
        heading: "Outlooks",
        links: [
          {
            name: "Monthly Climate Summary",
            href: "/climate/monthly",
            description: "How last month compared with normal",
          },
          {
            name: "Seasonal Outlook",
            href: "/climate/seasonal",
            description: "Rainfall and temperature for the months ahead",
          },
          {
            name: "Drought Monitoring",
            href: "/climate/drought",
            description: "Dry-spell status across the tri-island state",
          },
        ],
      },
      {
        heading: "Requests and publications",
        links: [
          {
            name: "Data Request Form",
            href: "/climate/data-request",
            description: "Ask for climate data for research or business",
          },
          {
            name: "Publications",
            href: "/climate/publications",
            description: "Reports, bulletins and climate studies",
          },
        ],
      },
    ],
  },
  {
    label: "Resources",
    groups: [
      {
        heading: "Prepare",
        links: [
          {
            name: "Hurricane Preparedness",
            href: "/resources/hurricane",
            description: "What every household should have ready",
          },
          {
            name: "Flood Preparedness",
            href: "/resources/flood",
            description: "Before, during and after heavy rain",
          },
          {
            name: "Marine Safety",
            href: "/resources/marine-safety",
            description: "Staying safe on the water",
          },
        ],
      },
      {
        heading: "Learn",
        links: [
          {
            name: "Weather Glossary",
            href: "/resources/glossary",
            description: "The terms we use in forecasts and warnings",
          },
          {
            name: "Understanding Warnings",
            href: "/resources/warnings-guide",
            description: "How to read a warning and act on it",
          },
          {
            name: "School Resources",
            href: "/resources/school",
            description: "Lesson material about Grenada's weather",
          },
          {
            name: "FAQs",
            href: "/resources/faqs",
            description: "Common questions about our services",
          },
          {
            name: "Downloads",
            href: "/resources/downloads",
            description: "Forms, posters and guides to keep",
          },
        ],
      },
    ],
  },
  {
    label: "About",
    href: "/about",
    groups: [],
  },
];

/** Every link in a section, in order — what the mobile drawer lists. */
export function sectionLinks(section: NavSection): NavLink[] {
  return section.groups.flatMap((group) => group.links);
}
