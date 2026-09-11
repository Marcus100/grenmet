import type { CapCategory } from "@barrelsgd/api-client";

export interface CapHazardGroup {
  categories: readonly CapCategory[];
  events: readonly string[];
  label: string;
}

/** Authoring suggestions, not approved thresholds, official event codes or issuing authority. */
export const CAP_HAZARD_GROUPS: readonly CapHazardGroup[] = [
  {
    label: "Tropical cyclone",
    categories: ["Met"],
    events: [
      "Tropical Depression",
      "Tropical Cyclone Watch",
      "Tropical Cyclone Warning",
      "Tropical Storm Watch",
      "Tropical Storm Warning",
      "Hurricane Watch",
      "Hurricane Warning",
    ],
  },
  {
    label: "Heavy rain and flooding",
    categories: ["Met"],
    events: [
      "Heavy Rainfall Advisory",
      "Heavy Rainfall Watch",
      "Heavy Rainfall Warning",
      "Flash Flood",
      "Flash Flood Watch",
      "Flash Flood Warning",
      "River Flood",
      "Urban Flood",
      "Surface Water Flood",
      "Reservoir Release",
    ],
  },
  {
    label: "Thunderstorm and wind",
    categories: ["Met"],
    events: [
      "Thunderstorm",
      "Lightning",
      "Severe Thunderstorm Watch",
      "Severe Thunderstorm Warning",
      "High Wind Advisory",
      "High Wind Warning",
      "Squall",
      "Downburst",
      "Tornado",
      "Waterspout",
      "Hail",
    ],
  },
  {
    label: "Marine and coastal",
    categories: ["Met"],
    events: [
      "Small Craft Advisory",
      "Rough Seas",
      "Hazardous Swell",
      "High Surf Advisory",
      "Gale Warning",
      "Storm Warning",
      "High Swell Advisory",
      "Rip Current Statement",
      "Dangerous Coastal Currents",
      "Storm Surge",
      "Coastal Inundation Advisory",
      "Coastal Flood",
      "Wave Overtopping",
      "Acute Coastal Erosion",
    ],
  },
  {
    label: "Heat and drought",
    categories: ["Met"],
    events: [
      "Heat Advisory",
      "Excessive Heat Warning",
      "Heatwave",
      "Drought",
      "Prolonged Dry Spell",
      "Fire Weather",
    ],
  },
  {
    label: "Air quality and visibility",
    categories: ["Met", "Env"],
    events: [
      "Saharan Dust Advisory",
      "Saharan Dust Warning",
      "Smoke",
      "Dense Fog",
      "Haze",
      "Hazardous Air Pollution",
      "Extreme Ultraviolet Exposure",
    ],
  },
  {
    label: "Earthquake and ground movement",
    categories: ["Geo"],
    events: [
      "Earthquake",
      "Damaging Aftershock",
      "Liquefaction",
      "Ground Settlement",
      "Subsidence",
      "Ground Collapse",
    ],
  },
  {
    label: "Landslide",
    categories: ["Geo"],
    events: [
      "Landslide",
      "Mudflow",
      "Debris Flow",
      "Rockfall",
      "Unstable Slope",
    ],
  },
  {
    label: "Volcanic activity",
    categories: ["Geo"],
    events: [
      "Volcanic Unrest",
      "Volcanic Eruption",
      "Volcanic Ashfall",
      "Airborne Volcanic Ash",
      "Volcanic Gas",
      "Submarine Volcanic Hazard",
      "Kick-em-Jenny Volcanic Activity",
    ],
  },
  {
    label: "Tsunami",
    categories: ["Geo"],
    events: [
      "Tsunami Information Statement",
      "Tsunami Watch",
      "Tsunami Advisory",
      "Tsunami Warning",
      "Tsunami Currents",
    ],
  },
  {
    label: "Fire and explosion",
    categories: ["Fire"],
    events: [
      "Bushfire",
      "Forest Fire",
      "Residential Fire",
      "Commercial Fire",
      "Industrial Fire",
      "Landfill Fire",
      "Vessel Fire",
      "Fuel Storage Fire",
      "Gas Cylinder Explosion",
      "Major Explosion",
    ],
  },
  {
    label: "Hazardous materials",
    categories: ["CBRNE", "Env"],
    events: [
      "Chemical Spill",
      "Toxic Gas Release",
      "LPG Leak",
      "Fuel Leak",
      "Pesticide Incident",
      "Hazardous Waste Release",
      "Dangerous Goods Accident",
    ],
  },
  {
    label: "Marine pollution",
    categories: ["Env"],
    events: [
      "Oil Spill",
      "Marine Chemical Discharge",
      "Marine Sewage Contamination",
      "Hazardous Floating Debris",
      "Contaminated Bathing Water",
    ],
  },
  {
    label: "Water and food safety",
    categories: ["Health"],
    events: [
      "Drinking Water Contamination",
      "Water Treatment Failure",
      "Sewage Intrusion",
      "Foodborne Outbreak",
      "Contaminated Food",
      "Urgent Product Recall",
    ],
  },
  {
    label: "Public health",
    categories: ["Health"],
    events: [
      "Infectious Disease Outbreak",
      "Epidemic",
      "Pandemic",
      "Vector-borne Disease Threat",
      "Zoonotic Outbreak",
      "Mass Poisoning",
      "Hazardous Exposure",
    ],
  },
  {
    label: "Environment and ecology",
    categories: ["Env"],
    events: [
      "Harmful Algal Bloom",
      "Hazardous Sargassum Accumulation",
      "Fish Kill",
      "Environmental Contamination",
      "Dangerous Animal Incident",
      "Invasive Species Incident",
    ],
  },
  {
    label: "Agriculture and animal health",
    categories: ["Env", "Health"],
    events: [
      "Crop Pest Outbreak",
      "Plant Disease",
      "Livestock Disease",
      "Animal Feed Contamination",
      "Threat to Food Production",
    ],
  },
  {
    label: "Water infrastructure",
    categories: ["Infra"],
    events: [
      "Major Water Supply Failure",
      "Dangerous Water Shortage",
      "Reservoir Failure",
      "Embankment Failure",
      "Dangerous Water Main Failure",
      "Wastewater System Failure",
    ],
  },
  {
    label: "Electricity and energy",
    categories: ["Infra"],
    events: [
      "Dangerous Power Outage",
      "Fallen Live Wires",
      "Electrical Infrastructure Fire",
      "Dangerous Fuel Supply Disruption",
    ],
  },
  {
    label: "Communications and digital infrastructure",
    categories: ["Infra"],
    events: [
      "Emergency Number Failure",
      "Major Telecommunications Outage",
      "Public Warning Channel Failure",
      "Essential Service Cyber Incident",
    ],
  },
  {
    label: "Buildings and structures",
    categories: ["Infra", "Safety"],
    events: [
      "Building Collapse",
      "Bridge Failure",
      "Retaining Wall Collapse",
      "Unsafe Structure",
      "Scaffolding Failure",
      "Crane Failure",
      "Falling Structural Debris",
    ],
  },
  {
    label: "Road transport",
    categories: ["Transport"],
    events: [
      "Major Road Crash",
      "Hazardous Materials Road Crash",
      "Road Collapse",
      "Dangerous Road Obstruction",
      "Community Access Blocked",
    ],
  },
  {
    label: "Aviation emergency",
    categories: ["Transport"],
    events: [
      "Aircraft Accident",
      "Airport Emergency",
      "Aviation Public Safety Hazard",
    ],
  },
  {
    label: "Maritime emergency",
    categories: ["Transport", "Rescue"],
    events: [
      "Vessel Collision",
      "Vessel Grounding",
      "Vessel Sinking",
      "Person Overboard",
      "Ferry Emergency",
      "Port Hazard",
      "Dangerous Navigation Obstruction",
    ],
  },
  {
    label: "Public safety and security",
    categories: ["Security", "Safety"],
    events: [
      "Credible Bomb Threat",
      "Suspicious Explosive Device",
      "Armed Threat",
      "Terrorism",
      "Violent Disturbance",
      "Imminent Public Safety Threat",
    ],
  },
  {
    label: "Crowd and mass casualty",
    categories: ["Safety", "Rescue"],
    events: [
      "Crowd Crush",
      "Dangerous Overcrowding",
      "Venue Emergency",
      "Mass Casualty Incident",
    ],
  },
  {
    label: "Search and rescue",
    categories: ["Rescue"],
    events: [
      "Missing Child",
      "Vulnerable Missing Person",
      "Overdue Vessel",
      "Lost Person",
      "Public Search Assistance",
    ],
  },
  {
    label: "Radiological and biological",
    categories: ["CBRNE"],
    events: [
      "Lost Radioactive Source",
      "Damaged Radioactive Source",
      "Radiation Release",
      "Radioactive Contamination",
      "Nuclear Incident",
      "Deliberate Biological Threat",
    ],
  },
  {
    label: "Other nationally approved events",
    categories: ["Other"],
    events: ["Other Emergency"],
  },
];

export const CAP_CATEGORY_LABELS: Record<CapCategory, string> = {
  Geo: "Geophysical",
  Met: "Meteorological",
  Safety: "Public safety",
  Security: "Security",
  Rescue: "Rescue",
  Fire: "Fire",
  Health: "Health",
  Env: "Environmental",
  Transport: "Transport",
  Infra: "Infrastructure",
  CBRNE: "Chemical, biological, radiological, nuclear or explosive",
  Other: "Other",
};

export function suggestedCategories(event: string): CapCategory[] {
  const normalized = event.trim().toLocaleLowerCase("en");
  const group = CAP_HAZARD_GROUPS.find((candidate) =>
    candidate.events.some((name) => name.toLocaleLowerCase("en") === normalized)
  );
  return group ? [...group.categories] : [];
}
