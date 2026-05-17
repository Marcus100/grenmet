export interface Condition {
  label: string;
  value: string;
}

export interface Warning {
  count: number;
  region: string;
}

export const CONDITIONS: Condition[] = [
  { label: "Max Temp", value: "31°C" },
  { label: "Min Temp", value: "24°C" },
  { label: "Wind Speed", value: "10–20 mph" },
  { label: "Wind Direction", value: "N to E" },
  { label: "Rain Chance", value: "40%" },
  { label: "Sea State", value: "Moderate to rough" },
  { label: "Wave Height", value: "6–9 ft" },
  { label: "Swell", value: "NE to E" },
  { label: "Low Tide", value: "12:30 pm" },
  { label: "High Tide", value: "05:50 am" },
  { label: "Sunset Today", value: "06:30 pm" },
  { label: "Sunrise Tomorrow", value: "5:30 am" },
];

export const WARNINGS: Warning[] = [
  { region: "Rain", count: 1 },
  { region: "Thunderstorm", count: 1 },
  { region: "Wind", count: 0 },
  { region: "Marine", count: 0 },
  { region: "Dust", count: 0 },
  { region: "Heat", count: 1 },
];
