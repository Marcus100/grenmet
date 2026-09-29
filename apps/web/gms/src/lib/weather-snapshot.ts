import { cache } from "react";
import { currentConditions } from "@/lib/current-conditions";
import {
  unavailableWeather,
  weatherFromForecast,
} from "@/lib/forecast-selection";
import { fetchCurrentConditions, fetchPublicForecast } from "@/lib/products";

/** Issued forecasts plus the latest MBIA register reading, fetched together. */
export const getWeatherSnapshot = cache(async () => {
  const [forecast, current] = await Promise.all([
    fetchPublicForecast(),
    fetchCurrentConditions(),
  ]);
  const weather = forecast
    ? weatherFromForecast(forecast)
    : unavailableWeather();
  const observation = current?.observation;
  return {
    ...weather,
    current: observation ? currentConditions(observation) : null,
  };
});
