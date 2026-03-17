interface MiddayReportProps {
  airportName?: string;
  airTemperature?: string;
  date?: string;
  documentNumber?: string;
  forecasterName?: string;
  generalWarning?: string;
  location?: string;
  marineWarning?: string;
  organization?: string;
  seas?: string;
  sunrise?: string;
  sunset?: string;
  tideHigh?: string;
  tideLow?: string;
  validity?: string;
  weather?: string;
  wind?: string;
  wordOfTheDay?: string;
  wordOfTheDayDefinition?: string;
  year?: string;
}

export default function MiddayFcst({
  organization = "Meteorological Services, MBIA",
  documentNumber = "F 750 - 03",
  year = "2020",
  date = "Saturday, December 20, 2025",
  location = "the state of Grenada",
  airportName = "Maurice Bishop International Airport",
  airTemperature = "30.0°C",
  validity = "This afternoon & tonight (12:00 pm until 6:00 am)",
  weather = "Partly cloudy and breezy with light to moderate isolated showers.",
  generalWarning = "None",
  wind = "NE'ly to E'ly @ 14 - 24 mph",
  seas = "Moderate to slightly rough with waves 6 to 8 ft in NE'ly to E'ly swells.",
  marineWarning = "Marine advisory remains in effect!",
  tideHigh = "3:15 pm",
  tideLow = "11:00 pm",
  sunset = "5:47",
  sunrise = "6:23",
  wordOfTheDay = "MIXED CLOUD",
  wordOfTheDayDefinition = "A cloud containing both water drops and ice crystals.",
  forecasterName = "Vondi Cyrus",
}: MiddayReportProps) {
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
          Midday Weather Report
        </h1>
        <div className="font-medium text-sm text-zinc-600">Date: {date}</div>
      </div>

      {/* Actual Temperature Section */}
      <div className="mb-6">
        <div className="rounded-lg bg-zinc-50 px-6 py-4 ring-1 ring-zinc-200">
          <div className="font-semibold text-sm text-zinc-900">
            Actual at {airportName}:
          </div>
          <div className="mt-2 rounded bg-white px-4 py-3 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">
                Air temperature @ midday:
              </span>{" "}
              <span className="font-bold text-xl text-zinc-900">
                {airTemperature}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Public Weather Forecast Section */}
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
                  {tideHigh && `High: ${tideHigh}`}
                  {tideHigh && tideLow && ", "}
                  {tideLow && `Low: ${tideLow}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sunset/Sunrise Box */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">
              Today&apos;s sunset:
            </span>{" "}
            <span className="text-zinc-700">{sunset}</span>
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">
              Tomorrow&apos;s sunrise:
            </span>{" "}
            <span className="text-zinc-700">{sunrise}</span>
          </div>
        </div>
      </div>

      {/* Word of the Day Section */}
      {wordOfTheDay && (
        <div className="mb-6 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="mb-2 font-bold text-xs text-zinc-900 uppercase tracking-wide">
            WORD OF THE DAY:
          </div>
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">{wordOfTheDay}:</span>{" "}
            <span className="text-zinc-700">{wordOfTheDayDefinition}</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="mb-6 border-zinc-200 border-t" />

      {/* Footer Section */}
      <div className="text-sm">
        <div className="font-semibold text-zinc-900">{forecasterName}</div>
        <div className="font-medium text-xs text-zinc-600">Forecaster</div>
      </div>
    </div>
  );
}
