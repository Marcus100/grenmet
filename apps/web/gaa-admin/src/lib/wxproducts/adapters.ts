/**
 * Adapters: Transform schema types → component props.
 * Strict, reusable, and testable. Easily swap data source (examples → DB) later.
 */

import type {
  EveningForecastProduct,
  MarineBulletinProduct,
  MiddayForecastProduct,
  MorningForecastProduct,
} from "@/db/wxproducts/schema";

/**
 * MorningForecast adapter: Extract component props from schema.
 */
export function adaptMorningForecast(product: MorningForecastProduct) {
  const metadata = product.product_metadata;
  const forecast = product.forecast;

  return {
    organization: "GRENADA METEOROLOGICAL SERVICE",
    productTitle: "Morning Public Forecast",
    productId: metadata.product_id,
    documentNumber: "001",
    dateIssued: new Date(metadata.issue_datetime_local).toLocaleDateString(
      "en-US",
      { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    ),
    timeIssued: new Date(metadata.issue_datetime_local).toLocaleTimeString(
      "en-US",
      { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
    ),
    validity: metadata.validity.validity_text,
    validFrom: new Date(metadata.validity.valid_from_local).toLocaleString(
      "en-US"
    ),
    validUntil: new Date(metadata.validity.valid_to_local).toLocaleString(
      "en-US"
    ),
    location: metadata.geography.area_name,
    headline: forecast.headline,
    synopsis: "An Atlantic high-pressure ridge remains the dominant feature.",
    weather: forecast.elements.weather?.text ?? "No weather data",
    maxTemperature: `${forecast.elements.temperature?.max_c ?? 0}°C`,
    minTemperature: `${forecast.elements.temperature?.min_c ?? 0}°C`,
    windDirectionMin: forecast.elements.wind?.direction_min ?? "Unknown",
    windDirectionMax: forecast.elements.wind?.direction_max ?? "Unknown",
    windSpeedMin: forecast.elements.wind?.speed_min ?? 0,
    windSpeedMax: forecast.elements.wind?.speed_max ?? 0,
    windSpeedUnit: forecast.elements.wind?.speed_unit ?? "mph",
    windSpeedGusting: forecast.elements.wind?.speed_gusting ?? undefined,
    seas: forecast.elements.seas?.text ?? "No seas data",
    waveHeights: forecast.elements.seas?.wave_max
      ? `${forecast.elements.seas.wave_max.value}–7 ft`
      : "Unknown",
    tideLow: forecast.elements.tides?.events.find((e) => e.type === "low")
      ?.time_local,
    tideHigh: forecast.elements.tides?.events.find((e) => e.type === "high")
      ?.time_local,
    sunrise: forecast.elements.sun_moon?.sunrise_local,
    sunset: forecast.elements.sun_moon?.sunset_local,
    marineAdvisory: forecast.product_notes?.advisories_text?.[0],
    whatToExpect: forecast.product_notes?.advisories_text,
    forecasterName: metadata.forecaster.name,
    nextUpdate: "6:00 PM AST",
    footerNote:
      "This forecast is issued by the Grenada Meteorological Service and is valid for the State of Grenada and surrounding coastal waters.",
  };
}

/**
 * MiddayForecast adapter: Extract component props from schema.
 */
export function adaptMiddayForecast(product: MiddayForecastProduct) {
  const metadata = product.product_metadata;
  const forecast = product.forecast;

  return {
    organization: "Grenada Meteorological Service",
    documentNumber: metadata.product_id,
    year: new Date(metadata.issue_datetime_local).getFullYear().toString(),
    date: new Date(metadata.issue_datetime_local).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    location: metadata.geography.area_name,
    airportName: forecast.station_observation.station_name,
    airTemperature: `${forecast.station_observation.air_temperature_c}°C`,
    validity: metadata.validity.validity_text,
    weather: forecast.elements.weather?.text ?? "No weather data",
    wind: `${forecast.elements.wind?.direction_min ?? "Unknown"}'ly to ${forecast.elements.wind?.direction_max ?? "Unknown"}'ly @ ${forecast.elements.wind?.speed_min ?? 0}-${forecast.elements.wind?.speed_max ?? 0} ${forecast.elements.wind?.speed_unit ?? "mph"}`,
    seas: forecast.elements.seas?.text ?? "No seas data",
    tideHigh: forecast.elements.tides?.events
      .filter((e) => e.type === "high")
      .at(0)?.time_local,
    tideLow: forecast.elements.tides?.events.find((e) => e.type === "low")
      ?.time_local,
    sunset: forecast.elements.sun_moon?.sunset_local,
    sunrise: forecast.elements.sun_moon?.sunrise_next_local,
    wordOfTheDay: forecast.education?.word_of_the_day?.term,
    wordOfTheDayDefinition: forecast.education?.word_of_the_day?.definition,
    forecasterName: metadata.forecaster.name,
  };
}

/**
 * EveningForecast adapter: Extract component props from schema.
 */
export function adaptEveningForecast(product: EveningForecastProduct) {
  const metadata = product.product_metadata;

  const currentDate = new Date(
    metadata.issue_datetime_local
  ).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    organization: "Grenada Meteorological Service",
    documentNumber: metadata.product_id,
    year: new Date(metadata.issue_datetime_local).getFullYear().toString(),
    location: metadata.geography.area_name,
    currentDate,
    validity: metadata.validity.validity_text,
    forecasterName: metadata.forecaster.name,
  };
}

/**
 * MarineBulletin adapter: Extract component props from schema.
 */
export function adaptMarineBulletin(product: MarineBulletinProduct) {
  const metadata = product.product_metadata;
  const forecast = product.forecast;

  const issueTime = new Date(metadata.issue_datetime_local);
  const date = issueTime.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = issueTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    date,
    time,
    organization:
      metadata.geography.area_name || "GRENADA METEOROLOGICAL SERVICE",
    validity: `VALID ${metadata.validity.valid_duration_hours} HRS`,
    warningLevel: forecast.color_code,
    synopsis: forecast.synopsis.summary,
    weather: forecast.elements.weather?.text ?? "No weather data",
    seaState: forecast.elements.seas?.text ?? "No seas data",
    visibility: forecast.elements.visibility?.text ?? "Visibility unknown",
    wind: `${forecast.elements.wind?.direction_min ?? "Unknown"}'ly to ${forecast.elements.wind?.direction_max ?? "Unknown"}'ly @ ${forecast.elements.wind?.speed_min ?? 0} to ${forecast.elements.wind?.speed_max ?? 0} ${forecast.elements.wind?.speed_unit ?? "mph"}`,
    tideHigh1: forecast.elements.tides?.events
      .filter((e) => e.type === "high")
      .at(0)?.time_local,
    tideLow: forecast.elements.tides?.events.find((e) => e.type === "low")
      ?.time_local,
    tideHigh2: forecast.elements.tides?.events
      .filter((e) => e.type === "high")
      .at(1)?.time_local,
    sunrise: forecast.elements.sun_moon?.sunrise_local,
    sunset: forecast.elements.sun_moon?.sunset_local,
    forecasterName: metadata.forecaster.name,
    email: "meteorology@gaa.gd",
    telephones: "(473) 444-4142/4101",
    fax: "(473) 444-1574",
  };
}
