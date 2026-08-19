export interface Condition {
  label: string;
  value: string;
}

export interface Warning {
  count: number;
  region: string;
}

export const WARNINGS: Warning[] = [
  { region: "Tropical Cyclone", count: 0 },
  { region: "Marine / Small Craft", count: 0 },
  { region: "Flood / Heavy Rain", count: 0 },
  { region: "Thunderstorm", count: 0 },
  { region: "Wind", count: 0 },
  { region: "Heat", count: 0 },
  { region: "Dust / Haze", count: 0 },
  { region: "Coastal Hazard", count: 0 },
];

export const TODAY_CONDITIONS: Condition[] = [
  { label: "Max Temp", value: "31°C" },
  { label: "Wind Speed", value: "10–20 mph" },
  { label: "Wind Direction", value: "NE to E" },
  { label: "Rain Chance", value: "40%" },
  { label: "Sea State", value: "Moderate to rough" },
  { label: "Wave Height", value: "6–9 ft" },
  { label: "Low Tide", value: "12:30 pm" },
  { label: "High Tide", value: "4:45 pm" },
  { label: "Sunset Today", value: "06:30 pm" },
  { label: "Sunrise Tomorrow", value: "05:50 am" },
];
