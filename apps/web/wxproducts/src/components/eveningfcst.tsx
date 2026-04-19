interface DayForecast {
  date: string;
  marineWarning?: string;
  maxTemp?: string;
  minTemp?: string;
  seas: string;
  sunrise?: string;
  sunset?: string;
  tideHigh?: string;
  tideLow?: string;
  warning: string;
  weather: string;
  wind: string;
}

function DayForecastCard({ day }: { day: DayForecast }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="mb-3 font-semibold text-sm text-zinc-900">{day.date}</div>
      <div className="space-y-2">
        {(day.sunrise || day.sunset) && (
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              {day.sunrise && (
                <span className="text-zinc-700">
                  <span className="font-semibold text-zinc-900">Sunrise:</span>{" "}
                  {day.sunrise}
                </span>
              )}
              {day.sunrise && day.sunset && " "}
              {day.sunset && (
                <span className="text-zinc-700">
                  <span className="font-semibold text-zinc-900">Sunset:</span>{" "}
                  {day.sunset}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Weather:</span>{" "}
            <span className="text-zinc-700">{day.weather}</span>
          </div>
        </div>
        {(day.maxTemp || day.minTemp) && (
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">Max/Min Temp:</span>{" "}
              <span className="text-zinc-700">
                {day.maxTemp}/{day.minTemp}
              </span>
            </div>
          </div>
        )}
        <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Wind:</span>{" "}
            <span className="text-zinc-700">{day.wind}</span>
          </div>
        </div>
        <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Seas:</span>{" "}
            <span className="text-zinc-700">{day.seas}</span>
          </div>
        </div>

        {(day.tideLow || day.tideHigh) && (
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">Tides:</span>{" "}
              <span className="text-zinc-700">
                {day.tideLow && `Low: ${day.tideLow}`}
                {day.tideLow && day.tideHigh && " "}
                {day.tideHigh && `High: ${day.tideHigh}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EveningForecastProps {
  currentDate?: string;
  currentDay?: DayForecast;
  documentNumber?: string;
  forecastDays?: DayForecast[];
  forecasterName?: string;
  location?: string;
  organization?: string;
  validity?: string;
  year?: string;
}

import { gmsEveningForecastExample } from "@/data/gms-evening-forecast.example";
import type { EveningForecastProduct } from "@/db/schema";
import { adaptEveningForecast } from "@/lib/adapters";

export default function EveningForecast({
  product = gmsEveningForecastExample,
  organization,
  documentNumber,
  year,
  location,
  currentDate,
  validity,
  currentDay = {
    date: "6:00 pm until 6:00 am",
    weather:
      "Mostly fair, with a few, light showers during partly cloudy spells.",
    warning: "None",
    wind: "NE'ly - E'ly @ 12-22 mph",
    seas: "Moderate to rough with waves 6 - 9 ft in open NE to E'ly swells.",
    marineWarning: "Marine advisory remains in effect!",
    tideLow: "11:00 pm",
    tideHigh: "5:00 am",
    minTemp: "23.5 °C",
  },
  forecastDays = [
    {
      date: "Sunday, December 21, 2025",
      sunrise: "6:23",
      sunset: "5:47",
      weather: "Mostly fair and breezy with a low chance of showers.",
      warning: "None",
      maxTemp: "31.0°C",
      minTemp: "24.0°C",
      wind: "ENE'ly - E'ly @ 14-24 mph gusting higher @ times",
      seas: "Moderate to rough with waves 6 - 9 ft in NE to E'ly swells.",
      marineWarning: "Marine advisory remains in effect!",
      tideLow: "9:00 am",
    },
    {
      date: "Monday, December 22, 2025",
      sunrise: "6:23",
      sunset: "5:48",
      weather:
        "Mostly fair with a low chance of brief isolated showers overnight.",
      warning: "None",
      maxTemp: "31.5°C",
      minTemp: "24.0°C",
      wind: "ENE'ly - ESE'ly @ 12 - 22 mph gusting higher @ times",
      seas: "Moderate to slightly rough with waves 6 - 8 ft in NE to E'ly swells.",
      marineWarning: "Marine advisory remains in effect!",
    },
    {
      date: "Tuesday, December 23, 2025",
      sunrise: "6:24",
      sunset: "5:48",
      weather: "Mostly fair, with brief light early morning showers.",
      warning: "None",
      maxTemp: "30.5°C",
      minTemp: "24.0°C",
      wind: "ENE'ly - E'ly @ 13 - 23 mph gusting higher @ times",
      seas: "Moderate with waves 5 - 7 ft in NE to E'ly swells.",
      marineWarning: "Marine advisory remains in effect!",
    },
  ],
  forecasterName,
}: EveningForecastProps & { product?: EveningForecastProduct }) {
  const adapted = adaptEveningForecast(product);
  const finalOrganization = organization ?? adapted.organization;
  const finalDocumentNumber = documentNumber ?? adapted.documentNumber;
  const finalYear = year ?? adapted.year;
  const finalLocation = location ?? adapted.location;
  const finalCurrentDate = currentDate ?? adapted.currentDate;
  const finalValidity = validity ?? adapted.validity;
  const finalForecasterName = forecasterName ?? adapted.forecasterName;
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      {/* Header Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-start justify-between">
          <div className="``fon``t-medium text-sm text-zinc-700">
            {finalOrganization}
          </div>
          <div className="flex gap-4 text-right font-medium text-xs text-zinc-600">
            <span>{finalYear}</span>
            <span>{finalDocumentNumber}</span>
          </div>
        </div>
        <h1 className="mb-2 font-semibold text-xl text-zinc-900 tracking-tight">
          Public weather forecast for {finalLocation}
        </h1>
        <div className="mb-1 font-medium text-sm text-zinc-600">
          Date: {finalCurrentDate}
        </div>
        <div className="font-medium text-sm text-zinc-600">
          Validity: {finalValidity}
        </div>
      </div>

      {/* Forecast Rows */}
      <div className="mb-6 space-y-4">
        {/* Row 1: Saturday (Tonight) and Sunday */}
        <div className="flex gap-4">
          {/* Current Day Forecast (Tonight) */}
          <div className="min-w-0 flex-1 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="font-semibold text-sm text-zinc-900">
                {finalCurrentDate} - {currentDay.date}
              </div>
            </div>
            {currentDay.minTemp && (
              <div className="shrink-0">
                <div className="rounded bg-white px-4 py-3 ring-1 ring-zinc-200">
                  <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
                    Tonight&apos;s Minimum Temperature
                  </div>
                  <div className="mt-1 font-bold text-xl text-zinc-900">
                    {currentDay.minTemp}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
                <div className="text-sm">
                  <span className="font-semibold text-zinc-900">Weather:</span>{" "}
                  <span className="text-zinc-700">{currentDay.weather}</span>
                </div>
              </div>
              <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
                <div className="text-sm">
                  <span className="font-semibold text-zinc-900">Wind:</span>{" "}
                  <span className="text-zinc-700">{currentDay.wind}</span>
                </div>
              </div>
              <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
                <div className="text-sm">
                  <span className="font-semibold text-zinc-900">Seas:</span>{" "}
                  <span className="text-zinc-700">{currentDay.seas}</span>
                </div>
              </div>
              <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
                <div className="text-sm">
                  <span className="font-semibold text-zinc-900">Tides:</span>{" "}
                  <span className="text-zinc-700">
                    {currentDay.tideLow && `Low: ${currentDay.tideLow}`}
                    {currentDay.tideLow && currentDay.tideHigh && ", "}
                    {currentDay.tideHigh && `High: ${currentDay.tideHigh}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Sunday */}
          {forecastDays[0] && <DayForecastCard day={forecastDays[0]} />}
        </div>

        {/* Row 2: Monday and Tuesday */}
        <div className="flex gap-4">
          {forecastDays[1] && <DayForecastCard day={forecastDays[1]} />}
          {forecastDays[2] && <DayForecastCard day={forecastDays[2]} />}
        </div>
      </div>

      {/* Divider */}
      <div className="mb-6 border-zinc-200 border-t" />

      {/* Footer Section */}
      <div className="text-sm">
        <div className="font-semibold text-zinc-900">Forecaster</div>
        <div className="font-medium text-xs text-zinc-600">
          {finalForecasterName}
        </div>
      </div>
    </div>
  );
}
