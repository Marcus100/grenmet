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
            name: "Bulletins",
            href: "/products/bulletins",
            description: "Issued bulletins for all nine hazards",
          },
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
          {
            name: "Tsunami Information",
            href: "/warnings/tsunami",
            description: "Threat levels, natural warning signs and what to do",
          },
          {
            name: "Cyclone Archive",
            href: "/warnings/cyclone/archive",
            description:
              "Past tropical cyclones affecting the tri-island state",
          },
          {
            name: "Exercises and Drills",
            href: "/warnings/exercise",
            description: "How test warnings are marked during an exercise",
          },
          {
            name: "Get Alerts",
            href: "/subscribe",
            description: "Every channel warnings reach you through",
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
    label: "Weather",
    featured: "forecast",
    groups: [
      {
        heading: "Daily",
        links: [
          {
            name: "Impact-Based Forecasts",
            href: "/products/forecasts",
            description: "Issued morning, midday and evening reports",
          },
          {
            name: "NHC Products",
            href: "/products/nhc",
            description: "Tropical Weather Outlook",
          },
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
          {
            name: "Nowcast",
            href: "/forecasts/nowcast",
            description: "Rain and wind over the next six hours",
          },
          {
            name: "Saharan Dust and Haze",
            href: "/forecasts/dust",
            description: "Five-day dust outlook and visibility",
          },
          {
            name: "Sun and Moon",
            href: "/almanac",
            description: "Sunrise, sunset, twilight and moon phase",
          },
          {
            name: "Model Guidance",
            href: "/forecasts/models",
            description: "The numerical guidance behind the forecast",
          },
          {
            name: "Surface Analyses",
            href: "/forecasts/analyses",
            description: "The features driving today's weather",
          },
        ],
      },
      {
        heading: "Observations",
        links: [
          {
            name: "Observations",
            href: "/observations",
            description: "Latest readings from across the network",
          },
          {
            name: "Stations",
            href: "/observations/stations",
            description: "Every station, what it measures and where it sits",
          },
          {
            name: "Weather Cameras",
            href: "/observations/cameras",
            description: "Live views of sky and sea conditions",
          },
          {
            name: "Water Level Sensors",
            href: "/observations/water-levels",
            description: "River and coastal water level monitoring",
          },
          {
            name: "Upper Air",
            href: "/observations/upper-air",
            description: "Soundings through the depth of the atmosphere",
          },
          {
            name: "School Stations",
            href: "/observations/school-stations",
            description: "Student-run stations adding density to the network",
          },
        ],
      },
    ],
  },
  {
    label: "Climate",
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
          {
            name: "Climate Newsletter",
            href: "/climate/newsletter",
            description: "Monthly conditions, outlooks and what they mean",
          },
          {
            name: "Product Archive",
            href: "/climate/archive",
            description: "Past forecasts, warnings and bulletins",
          },
        ],
      },
    ],
  },
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
            href: "/sectors/marine",
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
          {
            name: "Event Forecasts",
            href: "/events",
            description: "Venue forecasts for Grenada's outdoor calendar",
          },
        ],
      },
      {
        heading: "Aviation products",
        links: [
          {
            name: "Aviation Weather",
            href: "/aviation",
            description: "Observations, forecasts and briefings for aviation",
          },
          {
            name: "METAR and TAF",
            href: "/aviation/metar-taf",
            description: "Current observations and terminal forecasts",
          },
          {
            name: "Flight Winds",
            href: "/aviation/flight-winds",
            description: "Wind and temperature at flight levels",
          },
          {
            name: "Significant Weather",
            href: "/aviation/sigwx",
            description: "Regional significant weather and hazards",
          },
          {
            name: "Pre-flight Briefings",
            href: "/aviation/briefing",
            description: "The briefing service provided to operators",
          },
        ],
      },
      {
        heading: "Marine products",
        links: [
          {
            name: "Marine Forecast",
            href: "/marine/forecast",
            description: "Wind, sea state and swell for Grenada waters",
          },
          {
            name: "Coastal Waters Forecast",
            href: "/marine/coastal",
            description: "Conditions by zone within 12 nautical miles",
          },
          {
            name: "Wave / Swell Forecast",
            href: "/marine/wave-swell",
            description: "Significant height, period and direction",
          },
          {
            name: "Nearshore Wave Model",
            href: "/marine/wave-model",
            description: "High-resolution modelling and wave energy flux",
          },
          {
            name: "Sea Conditions",
            href: "/marine/sea-conditions",
            description: "Observed sea state around the tri-island state",
          },
          {
            name: "Tide Information",
            href: "/marine/tides",
            description: "Predicted high and low water",
          },
          {
            name: "Small Craft Advisories",
            href: "/marine/small-craft",
            description: "Advisories in effect for small vessels",
          },
          {
            name: "Marine Safety",
            href: "/marine/safety",
            description: "Staying safe on the water",
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
            name: "Atlantic Hurricane Names",
            href: "/resources/hurricane-names",
            description: "How storms are named and why names are retired",
          },
          {
            name: "Articles",
            href: "/resources/articles",
            description: "Explainers on Grenada's weather and climate",
          },
        ],
      },
      {
        heading: "Help & Tools",
        links: [
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
          {
            name: "Website Help",
            href: "/help",
            description: "How to read the warnings, forecast and this site",
          },
          {
            name: "Mobile App",
            href: "/app-guide",
            description: "Warnings and forecasts on your phone",
          },
        ],
      },
      {
        heading: "Media & Regional",
        links: [
          {
            name: "For Media",
            href: "/media",
            description: "Broadcast-ready data, graphics and interviews",
          },
          {
            name: "Regional Weather",
            href: "/regional",
            description: "Neighbouring services and regional centres",
          },
        ],
      },
    ],
  },
  {
    label: "About",
    href: "/about",
    groups: [
      {
        heading: "The service",
        links: [
          {
            name: "About GMS",
            href: "/about",
            description: "Who we are and what we do",
          },
          {
            name: "Our services",
            href: "/about/services",
            description: "The full range of services we provide",
          },
          {
            name: "Our history",
            href: "/about/history",
            description: "How meteorology in Grenada developed",
          },
        ],
      },
      {
        heading: "How we work",
        links: [
          {
            name: "Observing network",
            href: "/about/network",
            description: "Where our observations come from",
          },
          {
            name: "Standards and partners",
            href: "/about/standards",
            description: "WMO, ICAO and regional cooperation",
          },
        ],
      },
      {
        heading: "Get in touch",
        links: [
          {
            name: "Contact us",
            href: "/about/contact",
            description: "Enquiries, media and data requests",
          },
          {
            name: "Careers",
            href: "/about/careers",
            description: "Working as a meteorologist or met assistant",
          },
        ],
      },
    ],
  },
];

/** Every link in a section, in order — what the mobile drawer lists. */
export function sectionLinks(section: NavSection): NavLink[] {
  return section.groups.flatMap((group) => group.links);
}
