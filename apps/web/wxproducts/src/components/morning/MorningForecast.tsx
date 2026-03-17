interface ImpactItem {
  affectedAreas?: string[];

  assessment?: string;
  hazard: string;

  hazardHeadline?: string;

  impactLevel: "Minor" | "Moderate" | "Severe" | "Extreme" | string;

  impactText: string[];

  likelihoodLevel:
    | "Very Low"
    | "Low"
    | "Medium"
    | "High"
    | "Very High"
    | string;

  responseLevel: "Be Aware" | "Be Prepared" | "Take Action" | string;

  responseText: string[];

  validFrom?: string;
  validUntil?: string;

  whatToExpect?: string[];
}

interface MorningForecastProps {
  dateIssued?: string;
  documentNumber?: string;

  footerNote?: string;

  forecasterName?: string;
  forecasterTitle?: string;

  furtherDetails?: string;

  headline?: string;

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

  recommendedActions?: string[];

  seas?: string;

  sunrise?: string;
  sunset?: string;
  swell?: string;

  synopsis?: string;
  tideHigh?: string;

  tideLow?: string;
  timeIssued?: string;

  updateStatement?: string;

  validFrom?: string;
  validity?: string;
  validUntil?: string;
  waveHeights?: string;

  weather?: string;
  weatherDetails?: string;

  whatToExpect?: string[];

  wind?: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-zinc-300" />
      <h2 className="font-semibold text-[11px] text-zinc-900 uppercase tracking-[0.22em]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-zinc-300" />
    </div>
  );
}

function LabelValue({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  if (!value) return null;

  return (
    <div>
      <p className="font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-900">{value}</p>
    </div>
  );
}

function Badge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    "Very Low": "bg-zinc-200 text-zinc-900",
    Low: "bg-zinc-700 text-white",
    Medium: "bg-yellow-500 text-zinc-950",
    High: "bg-orange-600 text-white",
    "Very High": "bg-red-700 text-white",

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
      className={`rounded-full px-3 py-1 font-semibold text-[10px] uppercase tracking-[0.14em] ${
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

  productTitle = "Morning Public Forecast",
  productSubtitle = "Public Weather Forecast",
  productId = "GMS-PWF-MORNING",
  documentNumber = "001",

  dateIssued = "Sunday 21 December 2025",
  timeIssued = "06:00 AM AST",

  validity = "Today and Tonight",
  validFrom = "06:00 AM AST Sunday 21 December 2025",
  validUntil = "06:00 AM AST Monday 22 December 2025",

  location = "the State of Grenada",

  headline = "Generally fair conditions are expected across Grenada today. Moderate trade winds will maintain choppy marine conditions across coastal waters.",

  synopsis = "A weak Atlantic high-pressure ridge remains the dominant feature across the eastern Caribbean.",

  furtherDetails = "Moderate easterly trade winds of 12 to 22 mph will continue across the island chain. These winds will maintain moderate to slightly rough seas across open waters.",

  weather = "Generally fair",
  weatherDetails = "Brief isolated showers possible",

  maxTemperature = "31°C",
  minTemperature = "24°C",

  wind = "East-northeast to east-southeast 12–22 mph",

  seas = "Moderate to slightly rough",
  waveHeights = "6–8 ft",
  swell = "Northeasterly swell",

  tideLow = "10:00 AM",
  tideHigh = "4:00 PM",

  sunrise = "5:48 AM",
  sunset = "6:23 PM",

  marineAdvisory = "Small craft operators should exercise caution in open waters.",

  whatToExpect = [
    "Choppy seas may affect small craft operations.",
    "Some marine and coastal recreational activities may experience minor disruption.",
  ],

  impacts = [
    {
      hazard: "Marine Conditions",
      likelihoodLevel: "Medium",
      impactLevel: "Minor",
      assessment: "Medium likelihood of minor marine impacts",
      impactText: [
        "Choppy seas may affect fishermen and small vessels.",
        "Open-water marine activities may become uncomfortable.",
      ],
      responseLevel: "Be Aware",
      responseText: [
        "Operators of small vessels should monitor sea conditions.",
      ],
    },
  ],

  recommendedActions = [
    "Small craft operators should exercise caution in open waters.",
    "Beachgoers should remain alert to changing sea conditions.",
    "Monitor updates from the Grenada Meteorological Service.",
  ],

  updateStatement = "Forecast conditions may change. Continue to monitor official updates.",

  forecasterName = "Trisha Miller",
  forecasterTitle = "Forecaster",

  nextUpdate = "6:00 PM AST",

  footerNote = "This forecast is issued by the Grenada Meteorological Service and is valid for the State of Grenada and surrounding coastal waters.",
}: MorningForecastProps) {
  return (
    <article className="bg-white p-8 shadow-sm ring-1 ring-zinc-200">
      {/* HEADER */}

      <header className="border-b pb-6">
        <div className="text-center">
          <p className="font-semibold text-[12px] uppercase tracking-[0.24em]">
            {organization}
          </p>

          <p className="text-sm text-zinc-600">{office}</p>

          <h1 className="mt-4 font-bold text-3xl uppercase">{productTitle}</h1>

          <p className="text-zinc-700">
            {productSubtitle} for {location}
          </p>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 sm:grid-cols-3">
          <LabelValue label="Product ID" value={productId} />
          <LabelValue label="Document No." value={documentNumber} />
          <LabelValue label="Time Issued" value={timeIssued} />
          <LabelValue label="Date Issued" value={dateIssued} />
          <LabelValue label="Valid From" value={validFrom} />
          <LabelValue label="Valid Until" value={validUntil} />
        </div>
      </header>

      {/* HEADLINE */}

      <section className="mt-6 rounded-xl bg-zinc-900 p-4 text-white">
        <p className="text-xs uppercase tracking-widest">Forecast Headline</p>
        <p className="mt-2 text-base">{headline}</p>
      </section>

      {/* WHAT TO EXPECT */}

      {whatToExpect && (
        <section className="mt-8 space-y-3">
          <SectionTitle>What to Expect</SectionTitle>

          <ul className="space-y-2 text-sm">
            {whatToExpect.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* SYNOPSIS */}

      <section className="mt-8 space-y-3">
        <SectionTitle>Synopsis</SectionTitle>
        <p className="text-sm">{synopsis}</p>
      </section>

      {/* FURTHER DETAILS */}

      {furtherDetails && (
        <section className="mt-8 space-y-3">
          <SectionTitle>Further Details</SectionTitle>
          <p className="text-sm">{furtherDetails}</p>
        </section>
      )}

      {/* PUBLIC FORECAST */}

      <section className="mt-8 space-y-4">
        <SectionTitle>Public Forecast</SectionTitle>

        <div className="grid gap-4 border p-5 sm:grid-cols-2">
          <LabelValue label="Weather" value={weather} />
          <LabelValue label="Details" value={weatherDetails} />
          <LabelValue label="Maximum Temperature" value={maxTemperature} />
          <LabelValue label="Minimum Temperature" value={minTemperature} />
          <LabelValue label="Wind" value={wind} />
          <LabelValue label="Sunrise" value={sunrise} />
          <LabelValue label="Sunset" value={sunset} />
        </div>
      </section>

      {/* MARINE */}

      <section className="mt-8 space-y-4">
        <SectionTitle>Marine Forecast</SectionTitle>

        <div className="grid gap-4 bg-zinc-50 p-5 sm:grid-cols-2">
          <LabelValue label="Sea State" value={seas} />
          <LabelValue label="Wave Heights" value={waveHeights} />
          <LabelValue label="Swell" value={swell} />
          <LabelValue label="Marine Advisory" value={marineAdvisory} />
          <LabelValue label="Low Tide" value={tideLow} />
          <LabelValue label="High Tide" value={tideHigh} />
        </div>
      </section>

      {/* IMPACTS */}

      {impacts && (
        <section className="mt-8 space-y-4">
          <SectionTitle>Impact-Based Information</SectionTitle>

          {impacts.map((item, i) => (
            <div className="border p-5" key={i}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">{item.hazard}</h3>

                <div className="flex gap-2">
                  <Badge value={item.likelihoodLevel} />
                  <Badge value={item.impactLevel} />
                  <Badge value={item.responseLevel} />
                </div>
              </div>

              {item.assessment && (
                <p className="mt-2 text-sm italic">{item.assessment}</p>
              )}

              <ul className="mt-3 space-y-1 text-sm">
                {item.impactText.map((p, j) => (
                  <li key={j}>• {p}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* ACTION */}

      {recommendedActions && (
        <section className="mt-8 space-y-4">
          <SectionTitle>Recommended Action</SectionTitle>

          <ul className="space-y-2 text-sm">
            {recommendedActions.map((a, i) => (
              <li key={i}>• {a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* FOOTER */}

      <footer className="mt-10 border-t pt-6">
        <div className="grid sm:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-500 uppercase">Issued By</p>
            <p className="font-semibold">{forecasterName}</p>
            <p>{forecasterTitle}</p>
          </div>

          <div className="text-right">
            <p className="text-xs text-zinc-500 uppercase">Next Update</p>
            <p>{nextUpdate}</p>
          </div>
        </div>

        {updateStatement && (
          <p className="mt-6 text-xs text-zinc-600">{updateStatement}</p>
        )}

        <p className="mt-4 text-xs text-zinc-500">{footerNote}</p>
      </footer>
    </article>
  );
}
