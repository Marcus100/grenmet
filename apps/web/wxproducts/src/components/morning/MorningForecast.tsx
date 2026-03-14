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
  timeIssued?: string;
  validity?: string;
  validUntil?: string;
  weather?: string;
  wind?: string;
  year?: string;
}

export default function MorningForecast({
  organization = "GRENADA METEOROLOGICAL SERVICE",
  date = "Sunday 21 December 2025",
  timeIssued = "06:00 AM AST",
  location = "the State of Grenada",
  validity = "Today and Tonight",
  validUntil = "06:00 AM Monday 22 December 2025",
  weather = "Generally fair.",
  generalWarning = "None",
  maxTemperature = "31.0°C",
  wind = "East-northeast to east-southeast @ 12 - 22 mph",
  seas = "Moderate to slightly rough Waves 6 - 8 ft Northeasterly to easterly swell",
  marineWarning,
  tideLow = "10:00 AM",
  tideHigh = "4:00 PM",
  sunset = "6:23 PM",
  sunrise = "5:48 AM",
  forecasterName = "Trisha Miller",
}: MorningForecastProps) {
  const hasGeneralWarning = Boolean(
    generalWarning && generalWarning !== "None",
  );
  const hasMarineWarning = Boolean(marineWarning && marineWarning.length > 0);

  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      <div className="space-y-2 text-center">
        <div className="font-semibold text-sm text-zinc-800 uppercase tracking-[0.08em]">
          {organization}
        </div>
        <h1 className="font-semibold text-2xl text-zinc-900 uppercase tracking-tight">
          Morning Weather Report
        </h1>
      </div>

      <div className="mt-8 space-y-1 text-sm text-zinc-700">
        <h2 className="font-semibold text-base text-zinc-900 tracking-tight">
          Public Weather Forecast for {location}
        </h2>
        <p>
          <span className="font-semibold text-zinc-900">Date Issued:</span>{" "}
          {date}
        </p>
        <p>
          <span className="font-semibold text-zinc-900">Time Issued:</span>{" "}
          {timeIssued}
        </p>
        <p>
          <span className="font-semibold text-zinc-900">Validity:</span>{" "}
          {validity}
        </p>
        <p>
          <span className="font-semibold text-zinc-900">Valid Until:</span>{" "}
          {validUntil}
        </p>
      </div>

      <div className="my-6 border-zinc-300 border-t" />

      <h3 className="mb-4 font-semibold text-sm text-zinc-900 uppercase tracking-[0.08em]">
        Forecast Summary
      </h3>

      <div className="space-y-3 rounded-lg bg-zinc-50 p-5 ring-1 ring-zinc-200">
        <div className="text-sm">
          <span className="font-semibold text-zinc-900">Weather:</span>{" "}
          <span className="text-zinc-700">{weather}</span>
        </div>

        <div className="text-sm">
          <span className="font-semibold text-zinc-900">
            Maximum Temperature:
          </span>{" "}
          <span className="text-zinc-700">{maxTemperature}</span>
        </div>

        <div className="text-sm">
          <span className="font-semibold text-zinc-900">Wind:</span>{" "}
          <span className="whitespace-pre-line text-zinc-700">{wind}</span>
        </div>

        <div className="text-sm">
          <span className="font-semibold text-zinc-900">Seas:</span>{" "}
          <span className="whitespace-pre-line text-zinc-700">{seas}</span>
        </div>

        {hasGeneralWarning && (
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">
              General Warning:
            </span>{" "}
            <span className="font-semibold text-zinc-900">
              {generalWarning}
            </span>
          </div>
        )}

        {hasMarineWarning && (
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Marine Warning:</span>{" "}
            <span className="font-semibold text-zinc-900">{marineWarning}</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Low Tide:</span>{" "}
            <span className="text-zinc-700">{tideLow}</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">High Tide:</span>{" "}
            <span className="text-zinc-700">{tideHigh}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Sunset:</span>{" "}
            <span className="text-zinc-700">{sunset}</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-zinc-900">Sunrise:</span>{" "}
            <span className="text-zinc-700">{sunrise}</span>
          </div>
        </div>
      </div>

      <div className="my-6 border-zinc-300 border-t" />

      <div className="space-y-1 text-sm">
        <div className="font-semibold text-zinc-900">Prepared by:</div>
        <div className="font-semibold text-zinc-900">{forecasterName}</div>
        <div className="text-zinc-700">Forecaster</div>
        <div className="text-zinc-700">{organization}</div>
      </div>

      <div className="mt-6 border-zinc-300 border-t" />
    </div>
  );
}
