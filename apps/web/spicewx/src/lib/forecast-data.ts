export interface Condition {
  label: string;
  value: string;
}

export interface Warning {
  count: number;
  region: string;
}

export const WARNINGS: Warning[] = [
  { region: "Rain", count: 0 },
  { region: "Thunderstorm", count: 0 },
  { region: "Wind", count: 0 },
  { region: "Marine", count: 0 },
  { region: "Dust", count: 0 },
  { region: "Heat", count: 0 },
];

export const TODAY_CONDITIONS: Condition[] = [
  { label: "Tonight's Min", value: "26.0°C" },
  { label: "Wind Speed", value: "14–24 mph" },
  { label: "Wind Direction", value: "ENE to E" },
  { label: "Sea State", value: "Moderate" },
  { label: "Wave Height", value: "4–6 ft" },
  { label: "Low Tide", value: "9:45 p.m." },
  { label: "High Tide", value: "3:30 a.m." },
  { label: "Warning", value: "None" },
];
