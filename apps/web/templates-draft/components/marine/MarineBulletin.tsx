interface MarineBulletinProps {
  date?: string;
  time?: string;
  organization?: string;
  validity?: string;
  warningLevel?: string;
  synopsis?: string;
  weather?: string;
  seaState?: string;
  visibility?: string;
  wind?: string;
  tideHigh1?: string;
  tideLow?: string;
  tideHigh2?: string;
  likelihood?: string;
  impact?: string;
  impactItems?: string[];
  response?: string;
  responseItems?: string[];
  lastMoonPhase?: string;
  nextMoonPhase?: string;
  moonrise?: string;
  moonset?: string;
  sunrise?: string;
  sunset?: string;
  forecasterName?: string;
  email?: string;
  telephones?: string;
  fax?: string;
}

export default function MarineBulletin({
  date = "Sun, Dec 21, 2025",
  time = "05:00 AM",
  organization = "STATE OF GRENADA METEOROLOGICAL DEPARTMENT, GAA",
  validity = "VALID 24 HRS",
  warningLevel = "YELLOW",
  synopsis = "Moderate to occasionally fresh winds and a relatively dry atmosphere will dominate.",
  weather = "Mostly fair with a low chance of a few light brief morning showers",
  seaState = "Moderate to slightly rough with waves 6 to 8 ft. in NE'ly to E'ly swell.",
  visibility = "Good [Greater than 5 nautical miles]",
  wind = "ENE'ly to ESE'ly @ 13 to 23 knots",
  tideHigh1 = "5:00 a.m.",
  tideLow = "10:00 a.m.",
  tideHigh2 = "4:45 p.m.",
  likelihood = "High",
  impact = "Minor",
  impactItems = [
    "- Choppy seas, impacting fishermen, small sailboats and other small craft (marine advisory)",
    "- Possible disruption to some marine-related activities",
  ],
  response = "Be Aware",
  responseItems = [
    "- Be aware of vulnerable small watercrafts especially during high tide",
  ],
  lastMoonPhase = "New Moon (19th Dec)",
  nextMoonPhase = "First Quarter (27th Dec)",
  moonrise = "7:40 am",
  moonset = "7:15 pm",
  sunrise = "6:23",
  sunset = "5:47",
  forecasterName = "Fimber Frank",
  email = "meteorology@gaa.gd",
  telephones = "(473) 444-4142/4101",
  fax = "(473) 444-1574",
}: MarineBulletinProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      {/* Header Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-start justify-between">
          <div className="text-sm font-medium text-zinc-700">
            <div>{date}</div>
            <div>{time}</div>
          </div>
          <div className="text-center">
            <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-900">
              MARINE BULLETIN
            </h1>
            <div className="text-xs font-medium text-zinc-600">
              {organization}
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-bold text-white">
            GAA
          </div>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
          {validity}
        </div>
      </div>

      {/* Warning Level and Synopsis Section */}
      <div className="mb-6 flex gap-4">
        <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-zinc-200 ring-1 ring-zinc-300">
          <span className="text-lg font-bold uppercase tracking-tight text-zinc-900">
            {warningLevel}
          </span>
        </div>
        <div className="flex-1 space-y-3">
          <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">SYNOPSIS:</span>{" "}
              <span className="text-zinc-700">{synopsis}</span>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">WEATHER:</span>{" "}
              <span className="text-zinc-700">{weather}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wave Icons Placeholder */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-700">
            West
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-white text-xs text-zinc-500 ring-1 ring-zinc-200">
            [Wave Graphic]
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-700">
            East
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-white text-xs text-zinc-500 ring-1 ring-zinc-200">
            [Wave Graphic]
          </div>
        </div>
      </div>

      {/* Detailed Marine Conditions */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-900">
            LIKELIHOOD
          </span>
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-bold text-white">
            {likelihood}
          </span>
        </div>
        <div className="space-y-2 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-inset ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">SEA STATE:</span>{" "}
              <span className="text-zinc-700">{seaState}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-inset ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">VISIBILITY:</span>{" "}
              <span className="text-zinc-700">{visibility}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-inset ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">WIND:</span>{" "}
              <span className="text-zinc-700">{wind}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-inset ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">TIDE:</span>{" "}
              <span className="text-zinc-700">
                High: {tideHigh1} Low: {tideLow} High: {tideHigh2}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact and Response Section */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-900">
              IMPACT
            </span>
            <span className="rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs font-bold text-white">
              {impact}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {impactItems?.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-900">
              RESPONSE
            </span>
            <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold text-white">
              {response}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {responseItems?.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Astronomical Data */}
      <div className="mb-6 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              LAST MOON PHASE
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {lastMoonPhase}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              NEXT MOON PHASE
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {nextMoonPhase}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              MOONRISE
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {moonrise}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              MOONSET
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {moonset}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              SUNRISE
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {sunrise}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              SUNSET
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {sunset}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-6 border-t border-zinc-200" />

      {/* Footer Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm">
          <div className="font-semibold text-zinc-900">
            FORECASTER {forecasterName}
          </div>
        </div>

      </div>
    </div>
  );
}

