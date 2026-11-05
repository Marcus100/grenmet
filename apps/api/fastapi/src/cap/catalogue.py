"""GMS warning catalogue: the hazard list, parish geocodes and product and colour labels.

Owned here, served by ``GET /api/v1/cap/gms-catalogue``. The gaa-admin desk reads it and
no longer keeps its own copy. Moved from apps/web/gaa-admin (cap-hazards.ts,
cap-levels.ts, cap-areas.ts and the parish list in data/cap/grenada-boundaries.ts) on
2026-10-30; ``tests/cap/fixtures/gms_catalogue.json`` is the snapshot taken before the move.

The hazard list holds authoring suggestions only: not approved thresholds, official event
codes or an issuing authority. GMS owns the wording. Colour-to-severity comes from
``src/cap/levels.py``, the single source for the GMS colour rules.
"""

from dataclasses import dataclass

from src.cap.levels import GmsColour, GmsProduct, awareness_code, severity_for
from src.cap.models import CapCategory, CapSeverity

GEOCODE_NAME = "ISO3166-2:GD"


@dataclass(frozen=True)
class HazardGroup:
    label: str
    categories: tuple[CapCategory, ...]
    events: tuple[str, ...]


@dataclass(frozen=True)
class Parish:
    id: str
    iso_code: str
    name: str
    short_name: str


HAZARD_GROUPS: tuple[HazardGroup, ...] = (
    HazardGroup(
        label="Tropical cyclone",
        categories=(CapCategory.MET,),
        events=(
            "Tropical Depression",
            "Tropical Cyclone Watch",
            "Tropical Cyclone Warning",
            "Tropical Storm Watch",
            "Tropical Storm Warning",
            "Hurricane Watch",
            "Hurricane Warning",
        ),
    ),
    HazardGroup(
        label="Heavy rain and flooding",
        categories=(CapCategory.MET,),
        events=(
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
        ),
    ),
    HazardGroup(
        label="Thunderstorm and wind",
        categories=(CapCategory.MET,),
        events=(
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
        ),
    ),
    HazardGroup(
        label="Marine and coastal",
        categories=(CapCategory.MET,),
        events=(
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
        ),
    ),
    HazardGroup(
        label="Heat and drought",
        categories=(CapCategory.MET,),
        events=(
            "Heat Advisory",
            "Excessive Heat Warning",
            "Heatwave",
            "Drought",
            "Prolonged Dry Spell",
            "Fire Weather",
        ),
    ),
    HazardGroup(
        label="Air quality and visibility",
        categories=(
            CapCategory.MET,
            CapCategory.ENV,
        ),
        events=(
            "Saharan Dust Advisory",
            "Saharan Dust Warning",
            "Smoke",
            "Dense Fog",
            "Haze",
            "Hazardous Air Pollution",
            "Extreme Ultraviolet Exposure",
        ),
    ),
    HazardGroup(
        label="Earthquake and ground movement",
        categories=(CapCategory.GEO,),
        events=(
            "Earthquake",
            "Damaging Aftershock",
            "Liquefaction",
            "Ground Settlement",
            "Subsidence",
            "Ground Collapse",
        ),
    ),
    HazardGroup(
        label="Landslide",
        categories=(CapCategory.GEO,),
        events=(
            "Landslide",
            "Mudflow",
            "Debris Flow",
            "Rockfall",
            "Unstable Slope",
        ),
    ),
    HazardGroup(
        label="Volcanic activity",
        categories=(CapCategory.GEO,),
        events=(
            "Volcanic Unrest",
            "Volcanic Eruption",
            "Volcanic Ashfall",
            "Airborne Volcanic Ash",
            "Volcanic Gas",
            "Submarine Volcanic Hazard",
            "Kick-em-Jenny Volcanic Activity",
        ),
    ),
    HazardGroup(
        label="Tsunami",
        categories=(CapCategory.GEO,),
        events=(
            "Tsunami Information Statement",
            "Tsunami Watch",
            "Tsunami Advisory",
            "Tsunami Warning",
            "Tsunami Currents",
        ),
    ),
    HazardGroup(
        label="Fire and explosion",
        categories=(CapCategory.FIRE,),
        events=(
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
        ),
    ),
    HazardGroup(
        label="Hazardous materials",
        categories=(
            CapCategory.CBRNE,
            CapCategory.ENV,
        ),
        events=(
            "Chemical Spill",
            "Toxic Gas Release",
            "LPG Leak",
            "Fuel Leak",
            "Pesticide Incident",
            "Hazardous Waste Release",
            "Dangerous Goods Accident",
        ),
    ),
    HazardGroup(
        label="Marine pollution",
        categories=(CapCategory.ENV,),
        events=(
            "Oil Spill",
            "Marine Chemical Discharge",
            "Marine Sewage Contamination",
            "Hazardous Floating Debris",
            "Contaminated Bathing Water",
        ),
    ),
    HazardGroup(
        label="Water and food safety",
        categories=(CapCategory.HEALTH,),
        events=(
            "Drinking Water Contamination",
            "Water Treatment Failure",
            "Sewage Intrusion",
            "Foodborne Outbreak",
            "Contaminated Food",
            "Urgent Product Recall",
        ),
    ),
    HazardGroup(
        label="Public health",
        categories=(CapCategory.HEALTH,),
        events=(
            "Infectious Disease Outbreak",
            "Epidemic",
            "Pandemic",
            "Vector-borne Disease Threat",
            "Zoonotic Outbreak",
            "Mass Poisoning",
            "Hazardous Exposure",
        ),
    ),
    HazardGroup(
        label="Environment and ecology",
        categories=(CapCategory.ENV,),
        events=(
            "Harmful Algal Bloom",
            "Hazardous Sargassum Accumulation",
            "Fish Kill",
            "Environmental Contamination",
            "Dangerous Animal Incident",
            "Invasive Species Incident",
        ),
    ),
    HazardGroup(
        label="Agriculture and animal health",
        categories=(
            CapCategory.ENV,
            CapCategory.HEALTH,
        ),
        events=(
            "Crop Pest Outbreak",
            "Plant Disease",
            "Livestock Disease",
            "Animal Feed Contamination",
            "Threat to Food Production",
        ),
    ),
    HazardGroup(
        label="Water infrastructure",
        categories=(CapCategory.INFRA,),
        events=(
            "Major Water Supply Failure",
            "Dangerous Water Shortage",
            "Reservoir Failure",
            "Embankment Failure",
            "Dangerous Water Main Failure",
            "Wastewater System Failure",
        ),
    ),
    HazardGroup(
        label="Electricity and energy",
        categories=(CapCategory.INFRA,),
        events=(
            "Dangerous Power Outage",
            "Fallen Live Wires",
            "Electrical Infrastructure Fire",
            "Dangerous Fuel Supply Disruption",
        ),
    ),
    HazardGroup(
        label="Communications and digital infrastructure",
        categories=(CapCategory.INFRA,),
        events=(
            "Emergency Number Failure",
            "Major Telecommunications Outage",
            "Public Warning Channel Failure",
            "Essential Service Cyber Incident",
        ),
    ),
    HazardGroup(
        label="Buildings and structures",
        categories=(
            CapCategory.INFRA,
            CapCategory.SAFETY,
        ),
        events=(
            "Building Collapse",
            "Bridge Failure",
            "Retaining Wall Collapse",
            "Unsafe Structure",
            "Scaffolding Failure",
            "Crane Failure",
            "Falling Structural Debris",
        ),
    ),
    HazardGroup(
        label="Road transport",
        categories=(CapCategory.TRANSPORT,),
        events=(
            "Major Road Crash",
            "Hazardous Materials Road Crash",
            "Road Collapse",
            "Dangerous Road Obstruction",
            "Community Access Blocked",
        ),
    ),
    HazardGroup(
        label="Aviation emergency",
        categories=(CapCategory.TRANSPORT,),
        events=(
            "Aircraft Accident",
            "Airport Emergency",
            "Aviation Public Safety Hazard",
        ),
    ),
    HazardGroup(
        label="Maritime emergency",
        categories=(
            CapCategory.TRANSPORT,
            CapCategory.RESCUE,
        ),
        events=(
            "Vessel Collision",
            "Vessel Grounding",
            "Vessel Sinking",
            "Person Overboard",
            "Ferry Emergency",
            "Port Hazard",
            "Dangerous Navigation Obstruction",
        ),
    ),
    HazardGroup(
        label="Public safety and security",
        categories=(
            CapCategory.SECURITY,
            CapCategory.SAFETY,
        ),
        events=(
            "Credible Bomb Threat",
            "Suspicious Explosive Device",
            "Armed Threat",
            "Terrorism",
            "Violent Disturbance",
            "Imminent Public Safety Threat",
        ),
    ),
    HazardGroup(
        label="Crowd and mass casualty",
        categories=(
            CapCategory.SAFETY,
            CapCategory.RESCUE,
        ),
        events=(
            "Crowd Crush",
            "Dangerous Overcrowding",
            "Venue Emergency",
            "Mass Casualty Incident",
        ),
    ),
    HazardGroup(
        label="Search and rescue",
        categories=(CapCategory.RESCUE,),
        events=(
            "Missing Child",
            "Vulnerable Missing Person",
            "Overdue Vessel",
            "Lost Person",
            "Public Search Assistance",
        ),
    ),
    HazardGroup(
        label="Radiological and biological",
        categories=(CapCategory.CBRNE,),
        events=(
            "Lost Radioactive Source",
            "Damaged Radioactive Source",
            "Radiation Release",
            "Radioactive Contamination",
            "Nuclear Incident",
            "Deliberate Biological Threat",
        ),
    ),
    HazardGroup(
        label="Other nationally approved events",
        categories=(CapCategory.OTHER,),
        events=("Other Emergency",),
    ),
)

CATEGORY_LABELS: dict[CapCategory, str] = {
    CapCategory.GEO: "Geophysical",
    CapCategory.MET: "Meteorological",
    CapCategory.SAFETY: "Public safety",
    CapCategory.SECURITY: "Security",
    CapCategory.RESCUE: "Rescue",
    CapCategory.FIRE: "Fire",
    CapCategory.HEALTH: "Health",
    CapCategory.ENV: "Environmental",
    CapCategory.TRANSPORT: "Transport",
    CapCategory.INFRA: "Infrastructure",
    CapCategory.CBRNE: "Chemical, biological, radiological, nuclear or explosive",
    CapCategory.OTHER: "Other",
}

PARISHES: tuple[Parish, ...] = (
    Parish(
        id="andrew",
        iso_code="GD-01",
        name="Saint Andrew",
        short_name="St. Andrew",
    ),
    Parish(
        id="david",
        iso_code="GD-02",
        name="Saint David",
        short_name="St. David",
    ),
    Parish(
        id="george",
        iso_code="GD-03",
        name="Saint George",
        short_name="St. George",
    ),
    Parish(
        id="john",
        iso_code="GD-04",
        name="Saint John",
        short_name="St. John",
    ),
    Parish(
        id="mark",
        iso_code="GD-05",
        name="Saint Mark",
        short_name="St. Mark",
    ),
    Parish(
        id="patrick",
        iso_code="GD-06",
        name="Saint Patrick",
        short_name="St. Patrick",
    ),
    Parish(
        id="carriacou-pm",
        iso_code="GD-10",
        name="Carriacou and Petite Martinique",
        short_name="Carriacou & Petite Martinique",
    ),
)

PRODUCT_LABELS: dict[GmsProduct, str] = {
    GmsProduct.OUTLOOK: "Outlook",
    GmsProduct.WATCH: "Watch",
    GmsProduct.WARNING: "Warning",
    GmsProduct.ADVISORY: "Small Craft Advisory",
}

COLOUR_LABELS: dict[GmsColour, str] = {
    GmsColour.GREEN: "Green",
    GmsColour.YELLOW: "Yellow",
    GmsColour.ORANGE: "Orange",
    GmsColour.RED: "Red",
}


def colour_rules() -> list[tuple[GmsColour, str, int, CapSeverity]]:
    """Each colour with its label, MeteoAlarm awareness code and CAP severity."""
    return [
        (colour, COLOUR_LABELS[colour], awareness_code(colour), severity_for(colour))
        for colour in GmsColour
    ]


def product_rules() -> list[tuple[GmsProduct, str, bool]]:
    """Each product with its label, and whether it carries a colour (an Outlook does not)."""
    return [
        (product, PRODUCT_LABELS[product], product is not GmsProduct.OUTLOOK)
        for product in GmsProduct
    ]
