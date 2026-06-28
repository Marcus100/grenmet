"use client";

import { useState } from "react";
import MorningForecast from "@/components/wxproducts/morningfcst";

export default function MorningForecastPage() {
  const [form, setForm] = useState({
    organization: "GRENADA METEOROLOGICAL SERVICE",
    office: "Maurice Bishop International Airport, St. George's, Grenada",
    location: "the State of Grenada",
    headline:
      "Generally fair conditions are expected across Grenada, with only brief isolated showers. Marine conditions remain moderate to slightly rough in open waters.",
    synopsis:
      "A weak Atlantic high-pressure ridge remains the dominant feature across the eastern Caribbean, maintaining mostly fair weather across Grenada. Moderate easterly trade winds continue to support choppy marine conditions across coastal waters.",
    weather: "Generally fair.",
    weatherDetails: "Brief isolated showers are possible during the period.",
    maxTemperature: "31.0°C",
    minTemperature: "24.0°C",
    windDirectionMin: "ENE",
    windDirectionMax: "ESE",
    windSpeedMin: "12",
    windSpeedMax: "22",
    windSpeedUnit: "mph",
    windSpeedGusting: "",
    seas: "Moderate to slightly rough.",
    marineAdvisory:
      "Small craft operators should exercise caution in open waters.",
  });

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  return (
    <main className="m-8 bg-zinc-50 px-4">
      <div className="flex flex-row gap-x-2">
        <form className="w-full space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="organization"
            >
              Organization
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="organization"
              onChange={(event) =>
                updateField("organization", event.target.value)
              }
              value={form.organization}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="office"
            >
              Office
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="office"
              onChange={(event) => updateField("office", event.target.value)}
              value={form.office}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="headline"
            >
              Headline
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="headline"
              onChange={(event) => updateField("headline", event.target.value)}
              value={form.headline}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="synopsis"
            >
              Synopsis
            </label>
            <textarea
              className="min-h-32 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="synopsis"
              onChange={(event) => updateField("synopsis", event.target.value)}
              value={form.synopsis}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="weather"
            >
              Weather
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="weather"
              onChange={(event) => updateField("weather", event.target.value)}
              value={form.weather}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="weatherDetails"
            >
              Weather Details
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="weatherDetails"
              onChange={(event) =>
                updateField("weatherDetails", event.target.value)
              }
              value={form.weatherDetails}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="maxTemperature"
            >
              Max Temperature
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="maxTemperature"
              onChange={(event) =>
                updateField("maxTemperature", event.target.value)
              }
              value={form.maxTemperature}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="minTemperature"
            >
              Min Temperature
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="minTemperature"
              onChange={(event) =>
                updateField("minTemperature", event.target.value)
              }
              value={form.minTemperature}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="windDirectionMin"
            >
              Wind Direction Min
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="windDirectionMin"
              onChange={(event) =>
                updateField("windDirectionMin", event.target.value)
              }
              value={form.windDirectionMin}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="windDirectionMax"
            >
              Wind Direction Max
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="windDirectionMax"
              onChange={(event) =>
                updateField("windDirectionMax", event.target.value)
              }
              value={form.windDirectionMax}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="windSpeedMin"
            >
              Wind Speed Min
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="windSpeedMin"
              onChange={(event) =>
                updateField("windSpeedMin", event.target.value)
              }
              type="number"
              value={form.windSpeedMin}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="windSpeedMax"
            >
              Wind Speed Max
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="windSpeedMax"
              onChange={(event) =>
                updateField("windSpeedMax", event.target.value)
              }
              type="number"
              value={form.windSpeedMax}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="windSpeedGusting"
            >
              Wind Speed Gusting
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="windSpeedGusting"
              onChange={(event) =>
                updateField("windSpeedGusting", event.target.value)
              }
              value={form.windSpeedGusting}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="seas"
            >
              Seas
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="seas"
              onChange={(event) => updateField("seas", event.target.value)}
              value={form.seas}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-medium text-sm text-zinc-900"
              htmlFor="marineAdvisory"
            >
              Marine Advisory
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              id="marineAdvisory"
              onChange={(event) =>
                updateField("marineAdvisory", event.target.value)
              }
              value={form.marineAdvisory}
            />
          </div>
        </form>

        <div className="mx-auto max-w-4xl">
          <MorningForecast
            {...form}
            windSpeedMax={Number(form.windSpeedMax)}
            windSpeedMin={Number(form.windSpeedMin)}
          />
        </div>
      </div>
    </main>
  );
}
