export type RiskLevel = "green" | "yellow" | "amber" | "red";
export type IbfLikelihood = "low" | "medium" | "high" | "extreme";

export interface Alert {
  description: string;
  effectiveFrom: string;
  effectiveUntil: string;
  id: string;
  riskLevel: RiskLevel;
  title: string;
  type: string;
}

export interface Forecast {
  alerts: Alert[];
  forecasterName: string;
  headline: string;
  ibfImpact: string;
  ibfLikelihood: IbfLikelihood;
  issuedAt: string;
  maxTemperature: number;
  minTemperature: number;
  productTitle: string;
  recommendedActions: string[];
  seas: string;
  sunrise: string;
  sunset: string;
  tides: string;
  validFrom: string;
  validUntil: string;
  weather: string;
  wind: string;
}

export interface CurrentConditions {
  condition: string;
  feelsLike: number;
  humidity: number;
  location: string;
  temperature: number;
  updatedAt: string;
  uvIndex: number;
  wind: string;
}

export const mockForecast: Forecast = {
  productTitle: "Morning Public Forecast",
  issuedAt: "2026-05-17T10:14:00",
  validFrom: "2026-05-17T06:00:00",
  validUntil: "2026-05-17T18:00:00",
  headline: "Partly cloudy with brief light to moderate showers.",
  weather: "Partly Cloudy",
  maxTemperature: 31,
  minTemperature: 24,
  wind: "NE 15–20 kt",
  seas: "1.0–1.5 m",
  tides: "High 0.6 m at 08:42 · Low 0.2 m at 14:55",
  sunrise: "05:42",
  sunset: "18:31",
  ibfLikelihood: "low",
  ibfImpact:
    "Minimal disruption expected. Small craft operators should exercise caution in open waters.",
  alerts: [
    {
      id: "2026-GD-001",
      type: "TROPICAL_STORM_WATCH",
      riskLevel: "amber",
      title: "Tropical Storm Watch",
      description:
        "A Tropical Storm Watch is in effect for Grenada, Carriacou and Petite Martinique.",
      effectiveFrom: "2026-05-17T14:00:00",
      effectiveUntil: "2026-05-18T14:00:00",
    },
  ],
  recommendedActions: [
    "Small craft operators should remain in port or exercise extreme caution.",
    "Secure loose outdoor items and trim trees where possible.",
    "Monitor official bulletins for further updates.",
  ],
  forecasterName: "J. Smith",
};

export const mockCurrentConditions: CurrentConditions = {
  location: "Grenada (Point Salines)",
  temperature: 29,
  feelsLike: 33,
  humidity: 78,
  wind: "NE 15 kt",
  uvIndex: 8,
  condition: "Partly Cloudy",
  updatedAt: "2026-05-17T09:45:00",
};
