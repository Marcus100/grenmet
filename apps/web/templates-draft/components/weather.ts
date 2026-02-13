// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface WeatherOffice {
  name: string;
  country: string;
}

export interface ValidityPeriod {
  start: string; // ISO 8601 datetime
  end: string;   // ISO 8601 datetime
  description: string;
}

export interface TemperatureData {
  max_celsius: number | null;
  min_celsius: number | null;
}

export interface WindData {
  direction: {
    from: string; // e.g., "E", "NE"
    to: string;
  };
  speed: {
    min_mph: number;
    max_mph: number;
  };
}

export interface SeasData {
  state: string; // e.g., "Slight to moderate"
  wave_height_feet: {
    min: number;
    max: number;
  };
  area: string; // e.g., "open waters"
}

export interface TideTime {
  time_local: string; // HH:MM format
}

export interface Tides {
  high: TideTime[];
  low: TideTime[];
}

export interface SolarData {
  sunrise: string; // HH:MM format
  sunset: string;  // HH:MM format
}

export interface Forecaster {
  name: string;
  role: string;
}

export interface DocumentControl {
  form_number: string;
  issue_date_original: string; // YYYY-MM-DD
  status: string;
}

export interface MorningWeatherReport {
  id: string;
  report_type: "morning_weather_report";
  office: WeatherOffice;
  issue_date: string; // YYYY-MM-DD
  issue_time_local: string; // HH:MM format
  validity: ValidityPeriod;
  forecast_area: string;
  weather_summary: {
    description: string;
  };
  warnings: {
    public: string[];
    marine: string[];
  };
  meteorological_elements: {
    temperature: TemperatureData;
    wind: WindData;
    seas: SeasData;
  };
  marine_warning: string | null;
  tides: Tides;
  solar: SolarData;
  forecaster: Forecaster;
  document_control: DocumentControl;
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
}

// ============================================================================
// DATA
// ============================================================================

export const morning: MorningWeatherReport = {
  id: "uuid",
  report_type: "morning_weather_report",
  office: {
    name: "Meteorological Services, MBIA",
    country: "Grenada"
  },
  issue_date: "2026-02-08",
  issue_time_local: "06:00",
  validity: {
    start: "2026-02-08T06:00:00-04:00",
    end: "2026-02-09T06:00:00-04:00",
    description: "Today & tonight"
  },
  forecast_area: "Grenada",
  weather_summary: {
    description: "Partly cloudy with occasional showers, improving as the day progresses."
  },
  warnings: {
    public: [],
    marine: []
  },
  meteorological_elements: {
    temperature: {
      max_celsius: 30.0,
      min_celsius: null
    },
    wind: {
      direction: {
        from: "E",
        to: "SE"
      },
      speed: {
        min_mph: 10,
        max_mph: 20
      }
    },
    seas: {
      state: "Slight to moderate",
      wave_height_feet: {
        min: 3,
        max: 5
      },
      area: "open waters"
    }
  },
  marine_warning: null,
  tides: {
    high: [
      {
        time_local: "08:00"
      }
    ],
    low: [
      {
        time_local: "14:30"
      }
    ]
  },
  solar: {
    sunrise: "06:30",
    sunset: "18:12"
  },
  forecaster: {
    name: "Kassia Johnson",
    role: "Forecaster"
  },
  document_control: {
    form_number: "F 750-02",
    issue_date_original: "2020-01-11",
    status: "operational"
  },
  created_at: "2026-02-08T06:05:00-04:00",
  updated_at: "2026-02-08T06:05:00-04:00"
};

// ============================================================================
// FORMATTER FUNCTIONS
// ============================================================================

/**
 * Formats wind data into human-readable string
 * Example: "E'ly to SE'ly @ 10 to 20 mph"
 */
export function formatWind(wind: WindData): string {
  const { direction, speed } = wind;
  return `${direction.from}'ly to ${direction.to}'ly @ ${speed.min_mph} to ${speed.max_mph} mph`;
}

/**
 * Formats seas data into human-readable string
 * Example: "Slight to moderate with waves 3 to 5 ft. in open waters"
 */
export function formatSeas(seas: SeasData): string {
  const { state, wave_height_feet, area } = seas;
  return `${state} with waves ${wave_height_feet.min} to ${wave_height_feet.max} ft. in ${area}`;
}

/**
 * Formats temperature in Celsius with degree symbol
 * Example: "30.0°C" or "N/A" if null
 */
export function formatTemperature(celsius: number | null): string {
  return celsius !== null ? `${celsius.toFixed(1)}°C` : "N/A";
}

/**
 * Formats validity period with time range
 * Example: "Today & tonight (06:00 until 06:00)"
 */
export function formatValidity(validity: ValidityPeriod, issueTime: string): string {
  // Extract time from end datetime (simplified - assumes same format)
  const endTime = new Date(validity.end).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  return `${validity.description} (${issueTime} until ${endTime})`;
}

/**
 * Formats ISO date string to readable format
 * Example: "Saturday, February 8, 2026"
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

/**
 * Gets first tide time or returns fallback
 */
export function getFirstTideTime(tides: TideTime[], fallback = "N/A"): string {
  return tides[0]?.time_local || fallback;
}

/**
 * Formats warnings array into string or "None"
 */
export function formatWarnings(warnings: string[]): string {
  return warnings.length > 0 ? warnings.join('; ') : "None";
}

// ============================================================================
// TRANSFORMATION FUNCTION
// ============================================================================

/**
 * Transforms nested weather data into flat props for MorningForecast component
 */
export function transformToMorningForecastProps(data: MorningWeatherReport) {
  return {
    organization: data.office.name,
    documentNumber: data.document_control.form_number,
    year: new Date(data.document_control.issue_date_original).getFullYear().toString(),
    date: formatDate(data.issue_date),
    location: `the state of ${data.forecast_area}`,
    validity: formatValidity(data.validity, data.issue_time_local),
    weather: data.weather_summary.description,
    generalWarning: formatWarnings(data.warnings.public),
    maxTemperature: formatTemperature(data.meteorological_elements.temperature.max_celsius),
    wind: formatWind(data.meteorological_elements.wind),
    seas: formatSeas(data.meteorological_elements.seas),
    marineWarning: data.marine_warning || undefined,
    tideLow: getFirstTideTime(data.tides.low),
    tideHigh: getFirstTideTime(data.tides.high),
    sunset: data.solar.sunset,
    sunrise: data.solar.sunrise,
    forecasterName: data.forecaster.name,
  };
}