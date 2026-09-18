import { cache } from "react";
import {
  unavailableWeather,
  weatherFromForecast,
} from "@/lib/forecast-selection";
import { fetchPublicForecast } from "@/lib/products";
export const getWeatherSnapshot = cache(async () => {
  const forecast = await fetchPublicForecast();
  return forecast ? weatherFromForecast(forecast) : unavailableWeather();
});
