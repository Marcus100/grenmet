interface MorningForecastProps {
  date?: string;
  documentNumber?: string;
  forecasterName?: string;
  generalWarning?: string;
  location?: string;
  marineWarning?: string;
  maxTemperature?: string;
  organization?: string;
  seas?: string;
  sunrise?: string;
  sunset?: string;
  tideHigh?: string;
  tideLow?: string;
  validity?: string;
  weather?: string;
  wind?: string;
  year?: string;
}

export default function MorningForecast({
  organization = "Meteorological Services, MBIA",
  documentNumber = "F 750 - 02",
  year = "2020",
  date = "Sunday, December 21, 2025",
  location = "the state of Grenada",
  validity = "Today & tonight (6:00 am until 6:00 am)",
  weather = "Generally fair.",
  generalWarning = "None",
  maxTemperature = "31.0°C",
  wind = "ENE'ly to ESE'ly @ 12 to 22 mph",
  seas = "Moderate to slightly rough with waves 6 to 8 ft. in NE'ly to E'ly swell.",
  marineWarning,
  tideLow = "10:00 a.m.",
  tideHigh = "4:00 p.m.",
  sunset = "6:23",
  sunrise = "5:48",
  forecasterName = "Trisha Miller",
}: MorningForecastProps) {
  const hasGeneralWarning = generalWarning && generalWarning !== "None";
  const hasMarineWarning = marineWarning && marineWarning.length > 0;

  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      {/* Header Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-start justify-between">
          <div className="font-medium text-sm text-zinc-700">
            {organization}
          </div>
          <div className="flex gap-4 text-right font-medium text-xs text-zinc-600">
            <span>{year}</span>
            <span>{documentNumber}</span>
          </div>
        </div>
        <h1 className="mb-2 font-semibold text-xl text-zinc-900 tracking-tight">
          Morning Weather Report
        </h1>
        <div className="font-medium text-sm text-zinc-600">Date: {date}</div>
      </div>

      {/* Divider */}
      <div className="mb-8 border-zinc-200 border-t" />

      {/* Main Forecast Section */}
      <div className="mb-6">
        <h2 className="mb-2 font-semibold text-lg text-zinc-900 tracking-tight">
          Public weather forecast for {location}
        </h2>
        <p className="mb-6 font-medium text-sm text-zinc-600">
          Validity: {validity}
        </p>

        {/* Forecast Box */}
        <div className="rounded-lg bg-zinc-50 p-6 ring-1 ring-zinc-200">
          <div className="space-y-2">
            {/* Weather */}
            <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="text-sm">
                <span className="font-semibold text-zinc-900">Weather:</span>{" "}
                <span className="text-zinc-700">{weather}</span>
              </div>
            </div>

            {/* General Warning */}
            <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="text-sm">
                <span className="font-semibold text-zinc-900">WARNING:</span>{" "}
                <span
                  className={
                    hasGeneralWarning
                      ? "font-bold text-zinc-900"
                      : "text-zinc-600"
                  }
                >
                  {generalWarning}
                </span>
              </div>
            </div>

            {/* Max Temperature */}
            <div className="flex items-center gap-4 rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="flex-1 text-sm">
                <span className="font-semibold text-zinc-900">
                  Today&apos;s maximum temperature:
                </span>{" "}
                <span className="text-zinc-700">{maxTemperature}</span>
              </div>
              <div className="h-6 w-6 shrink-0 rounded bg-white ring-1 ring-zinc-300" />
            </div>

            {/* Wind */}
            <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="text-sm">
                <span className="font-semibold text-zinc-900">Wind:</span>{" "}
                <span className="text-zinc-700">{wind}</span>
              </div>
            </div>

            {/* Seas */}
            <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="text-sm">
                <span className="font-semibold text-zinc-900">Seas:</span>{" "}
                <span className="text-zinc-700">{seas}</span>
              </div>
            </div>

            {/* Marine Warning */}
            {hasMarineWarning && (
              <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
                <div className="text-sm">
                  <span className="font-semibold text-zinc-900">WARNING:</span>{" "}
                  <span className="font-bold text-zinc-900">
                    {marineWarning}
                  </span>
                </div>
              </div>
            )}

            {/* Tides */}
            <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
              <div className="text-sm">
                <span className="font-semibold text-zinc-900">Tides:</span>{" "}
                <span className="text-zinc-700">
                  Low: {tideLow} High: {tideHigh}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sunset/Sunrise Box */}
      <div className="mb-6 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">
                Today&apos;s sunset:
              </span>{" "}
              <span className="text-zinc-700">{sunset}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">
                Tomorrow&apos;s sunrise:
              </span>{" "}
              <span className="text-zinc-700">{sunrise}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-6 border-zinc-200 border-t" />

      {/* Signature Section */}
      <div className="text-sm">
        <div className="font-semibold text-zinc-900">{forecasterName}</div>
        <div className="font-medium text-xs text-zinc-600">Forecaster</div>
      </div>
    </div>
  );
}
