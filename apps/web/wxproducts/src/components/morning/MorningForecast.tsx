interface ImpactItem {
  hazard: string;
  impactLevel: "Minor" | "Moderate" | "Severe" | "Extreme" | string;
  impactText: string[];
  responseLevel: "Be Aware" | "Be Prepared" | "Take Action" | string;
  responseText: string[];
}

interface MorningForecastProps {
  dateIssued?: string;
  documentNumber?: string;
  footerNote?: string;

  forecasterName?: string;
  forecasterTitle?: string;

  impacts?: ImpactItem[];
  location?: string;
  marineAdvisory?: string;
  maxTemperature?: string;
  minTemperature?: string;
  nextUpdate?: string;
  office?: string;
  organization?: string;
  productId?: string;
  productSubtitle?: string;
  productTitle?: string;

  seas?: string;
  sunrise?: string;
  sunset?: string;
  swell?: string;

  synopsis?: string;
  tideHigh?: string;

  tideLow?: string;
  timeIssued?: string;
  validFrom?: string;
  validity?: string;
  validUntil?: string;
  waveHeights?: string;

  weather?: string;
  weatherDetails?: string;
  wind?: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-zinc-300 border-b pb-2 font-semibold text-[11px] text-zinc-900 uppercase tracking-[0.18em]">
      {children}
    </h2>
  );
}

function LabelValue({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  if (!value) return null;

  return (
    <div className={className}>
      <span className="font-semibold text-zinc-900">{label}:</span>{" "}
      <span className="text-zinc-700">{value}</span>
    </div>
  );
}

function SeverityBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    Minor: "bg-zinc-700 text-white",
    Moderate: "bg-amber-600 text-white",
    Severe: "bg-red-600 text-white",
    Extreme: "bg-purple-700 text-white",
    "Be Aware": "bg-zinc-800 text-white",
    "Be Prepared": "bg-amber-600 text-white",
    "Take Action": "bg-red-700 text-white",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-semibold text-[10px] uppercase tracking-wide ${
        styles[value] ?? "bg-zinc-700 text-white"
      }`}
    >
      {value}
    </span>
  );
}

export default function MorningForecast({
  organization = "GRENADA METEOROLOGICAL SERVICE",
  office = "Maurice Bishop International Airport, St. George's, Grenada",
  location = "the State of Grenada",
  productTitle = "Morning Weather Report",
  productSubtitle = "Public Weather Forecast",
  productId = "GMS-PWF-MORNING",
  documentNumber = "001",

  dateIssued = "Sunday 21 December 2025",
  timeIssued = "06:00 AM AST",
  validity = "Today and Tonight",
  validFrom = "06:00 AM AST Sunday 21 December 2025",
  validUntil = "06:00 AM AST Monday 22 December 2025",

  synopsis = "A weak Atlantic high-pressure ridge remains the dominant feature across the eastern Caribbean, maintaining generally fair weather conditions over Grenada. Moderate easterly trades continue to produce choppy marine conditions across regional waters.",

  weather = "Generally fair.",
  weatherDetails = "Brief isolated showers are possible during the period.",
  maxTemperature = "31.0°C",
  minTemperature,
  wind = "East-northeast to east-southeast at 12 to 22 mph.",

  seas = "Moderate to slightly rough.",
  waveHeights = "6 to 8 ft.",
  swell = "Northeasterly to easterly swell.",
  marineAdvisory = "Small craft operators should exercise caution in open waters.",

  tideLow = "10:00 AM",
  tideHigh = "4:00 PM",
  sunrise = "5:48 AM",
  sunset = "6:23 PM",

  impacts = [
    {
      hazard: "Marine Conditions",
      impactLevel: "Minor",
      impactText: [
        "Choppy seas may affect fishermen, small sailboats, and other vulnerable small craft.",
        "Some marine-related activities may experience minor disruption.",
      ],
      responseLevel: "Be Aware",
      responseText: [
        "Operators of small vessels should remain aware of sea conditions, especially near high tide and in exposed waters.",
      ],
    },
  ],

  forecasterName = "Trisha Miller",
  forecasterTitle = "Forecaster",
  nextUpdate = "6:00 PM AST",
  footerNote = "This forecast is issued by the Grenada Meteorological Service and is valid for the State of Grenada and its coastal waters.",
}: MorningForecastProps) {
  return (
    <article className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-8 text-zinc-900 shadow-sm ring-1 ring-zinc-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
      {/* Header */}
      <header className="border-zinc-300 border-b pb-2 text-center">
        <p className="font-semibold text-[12px] text-zinc-800 uppercase tracking-[0.22em]">
          {organization}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{office}</p>

        <h1 className="mt-4 font-bold text-3xl text-zinc-950 uppercase tracking-tight">
          {productTitle}
        </h1>
        <p className="mt-2 font-medium text-base text-zinc-700">
          {productSubtitle} for {location}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-600">
          <span>
            <span className="font-semibold text-zinc-900">Product ID:</span>{" "}
            {productId}
          </span>
        </div>
      </header>

      {/* Metadata */}
      <section className="mt-6 grid gap-3 rounded-xl bg-zinc-50 p-5 ring-1 ring-zinc-200 sm:grid-cols-2">
        <LabelValue
          className="text-sm"
          label="Date Issued"
          value={dateIssued}
        />
        <LabelValue
          className="text-sm"
          label="Time Issued"
          value={timeIssued}
        />
        <LabelValue className="text-sm" label="Validity" value={validity} />
        <LabelValue className="text-sm" label="Valid From" value={validFrom} />
      </section>

      {/* Synopsis */}
      <section className="mt-8 space-y-3">
        <SectionTitle>Synopsis</SectionTitle>
        <p className="text-sm text-zinc-700 leading-7">{synopsis}</p>
      </section>

      {/* Public Forecast */}
      <section className="mt-4 space-y-2">
        <SectionTitle>Public Forecast</SectionTitle>

        <div className="rounded-xl bg-white">
          <div className="space-y-3 rounded-xl border border-zinc-200 p-5">
            <LabelValue className="text-sm" label="Weather" value={weather} />
            <LabelValue
              className="text-sm"
              label="Details"
              value={weatherDetails}
            />
            <LabelValue
              className="text-sm"
              label="Maximum Temperature"
              value={maxTemperature}
            />
            <LabelValue
              className="text-sm"
              label="Minimum Temperature"
              value={minTemperature}
            />
            <LabelValue className="text-sm" label="Wind" value={wind} />
            <div className="flex space-x-4">
              <LabelValue className="text-sm" label="Sunrise" value={sunrise} />
              <LabelValue className="text-sm" label="Sunset" value={sunset} />
            </div>
          </div>
        </div>
      </section>

      {/* Marine Forecast */}
      <section className="mt-8 space-y-4">
        <SectionTitle>Marine Forecast</SectionTitle>

        <div className="rounded-xl bg-zinc-50 p-5 ring-1 ring-zinc-200">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelValue className="text-sm" label="Sea State" value={seas} />
            <LabelValue
              className="text-sm"
              label="Wave Heights"
              value={waveHeights}
            />
            <LabelValue
              className="text-sm sm:col-span-2"
              label="Swell Direction"
              value={swell}
            />
            <div className="flex space-x-4">
              <LabelValue
                className="text-sm"
                label="Low Tide"
                value={tideLow}
              />
              <LabelValue
                className="text-sm"
                label="High Tide"
                value={tideHigh}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Impact-Based Information */}
      {impacts.length > 0 && (
        <section className="mt-8 space-y-4">
          <SectionTitle>Impact-Based Information</SectionTitle>

          <div className="space-y-4">
            {impacts.map((item, index) => (
              <div
                className="rounded-xl border border-zinc-200 p-5"
                key={`${item.hazard}-${index}`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-base text-zinc-950">
                    {item.hazard}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
                      Likelihood
                    </span>
                    <SeverityBadge value={item.impactLevel} />
                    <span className="text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
                      Impact
                    </span>
                    <SeverityBadge value={item.impactLevel} />
                    <span className="ml-2 text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
                      Response
                    </span>
                    <SeverityBadge value={item.responseLevel} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <h4 className="mb-3 font-semibold text-xs text-zinc-900 uppercase tracking-[0.14em]">
                      Expected Impact
                    </h4>
                    <ul className="space-y-2 text-sm text-zinc-700 leading-6">
                      {item.impactText.map((point, i) => (
                        <li className="flex gap-2" key={i}>
                          <span className="mt-[2px] text-zinc-500">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <h4 className="mb-3 font-semibold text-xs text-zinc-900 uppercase tracking-[0.14em]">
                      Recommended Response
                    </h4>
                    <ul className="space-y-2 text-sm text-zinc-700 leading-6">
                      {item.responseText.map((point, i) => (
                        <li className="flex gap-2" key={i}>
                          <span className="mt-[2px] text-zinc-500">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-10 border-zinc-300 border-t pt-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-zinc-900">Issued By</p>
            <p className="font-semibold text-zinc-900">{forecasterName}</p>
            <p className="text-zinc-700">{forecasterTitle}</p>
          </div>

          <div className="space-y-1 text-sm sm:text-right">
            <p>
              <span className="font-semibold text-zinc-900">Next Update:</span>{" "}
              <span className="text-zinc-700">{nextUpdate}</span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-500 leading-6">{footerNote}</p>
      </footer>
    </article>
  );
}
