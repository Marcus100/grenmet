import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  ArrowDown,
  ArrowUp,
  Sunrise,
  Sunset,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import Image from "next/image";

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
  windDirectionMax?: string;

  windDirectionMin?: string;
  windSpeedGusting?: string;
  windSpeedMax?: number;
  windSpeedMin?: number;
  windSpeedUnit?: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <div className="h-px flex-1 bg-zinc-300" />
      <h2 className="font-semibold text-gm-label text-zinc-900 uppercase tracking-widest">
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
      <p className="font-semibold text-gm-label text-zinc-500 uppercase tracking-widest">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-900">{value}</p>
    </div>
  );
}

function MetricItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 ring-1 ring-zinc-200 ring-inset">
        <Icon className="h-5 w-5 text-zinc-700" strokeWidth={1.75} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-bold text-base text-zinc-900 tracking-tight">
          {value}
        </span>
        <span className="font-medium text-xs text-zinc-600 uppercase tracking-wide">
          {label}
        </span>
      </div>
    </div>
  );
}

const warningTone = {
  amber:
    "border-gm-warning-amber-border bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  green:
    "border-gm-warning-green-border bg-gm-warning-green-bg text-gm-warning-green-fg",
  grey: "border-gm-warning-grey-border bg-gm-warning-grey-bg text-gm-warning-grey-fg",
  red: "border-gm-warning-red-border bg-gm-warning-red-bg text-gm-warning-red-fg",
  yellow:
    "border-gm-warning-yellow-border bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
} as const;

function warningToneFor(value: string) {
  switch (value.toLowerCase()) {
    case "green":
    case "low":
      return warningTone.green;
    case "yellow":
    case "medium":
    case "be aware":
      return warningTone.yellow;
    case "amber":
    case "orange":
    case "high":
    case "moderate":
    case "be prepared":
      return warningTone.amber;
    case "red":
    case "very high":
    case "severe":
    case "extreme":
    case "take action":
      return warningTone.red;
    default:
      return warningTone.grey;
  }
}

function ImpactAlert({ item }: { item: ImpactItem }) {
  const tone = warningToneFor(item.responseLevel);

  return (
    <div className={`border-l-4 p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">{item.hazard}</h3>
        <div className="flex gap-2">
          <Badge value={item.likelihoodLevel} />
          <Badge value={item.impactLevel} />
          <Badge value={item.responseLevel} />
        </div>
      </div>
      {item.assessment && (
        <p className="mt-2 text-sm italic opacity-90">{item.assessment}</p>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {item.impactText.map((p) => (
          <li key={p}>- {p}</li>
        ))}
      </ul>
    </div>
  );
}

function Badge({ value }: { value: string }) {
  const tone = warningToneFor(value);

  return (
    <span
      className={`rounded-gm-full border px-3 py-1 font-semibold text-gm-micro uppercase tracking-widest ${tone}`}
    >
      {value}
    </span>
  );
}

export default function MorningForecast({
  organization = "GRENADA METEOROLOGICAL SERVICE",
  office:
    _office = "Maurice Bishop International Airport, St. George's, Grenada",

  productTitle = "Morning Public Forecast",
  productSubtitle: _productSubtitle = "Public Weather Forecast",
  productId = "GMS-PWF-MORNING",
  documentNumber: _documentNumber = "001",

  dateIssued = "Sunday 21 December 2025",
  timeIssued: _timeIssued = "06:00 AM AST",

  validity: _validity = "Today and Tonight",
  validFrom = "06:00 AM AST Sunday 21 December 2025",
  validUntil = "06:00 AM AST Monday 22 December 2025",

  location: _location = "the State of Grenada",

  headline = "Generally fair conditions are expected across Grenada today. Moderate trade winds will maintain choppy marine conditions across coastal waters.",

  synopsis = "A weak Atlantic high-pressure ridge remains the dominant feature across the eastern Caribbean.",

  furtherDetails:
    _furtherDetails = "Moderate easterly trade winds of 12 to 22 mph will continue across the island chain. These winds will maintain moderate to slightly rough seas across open waters.",

  weather: _weather = "Generally fair",
  weatherDetails: _weatherDetails = "Brief isolated showers possible",

  maxTemperature = "31°C",
  minTemperature = "24°C",

  windDirectionMin = "ENE",
  windDirectionMax = "ESE",
  windSpeedMin = 12,
  windSpeedMax = 22,
  windSpeedUnit = "mph",
  windSpeedGusting,

  seas = "Moderate to slightly rough",
  waveHeights = "6-8 ft",
  swell = "Northeasterly swell",

  tideLow = "10:00 AM",
  tideHigh = "4:00 PM",

  sunrise = "5:48 AM",
  sunset = "6:23 PM",

  marineAdvisory:
    _marineAdvisory = "Small craft operators should exercise caution in open waters.",

  whatToExpect: _whatToExpect = [
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

  nextUpdate = "6:00 PM AST",

  footerNote = "This forecast is issued by the Grenada Meteorological Service and is valid for the State of Grenada and surrounding coastal waters.",
}: MorningForecastProps) {
  return (
    <article className="bg-white p-8 font-gm-document shadow-sm ring-1 ring-zinc-200">
      {/* HEADER */}

      <header className="-m-8 mb-6 flex items-center justify-between bg-zinc-900 px-8 py-4">
        <Image
          alt={organization}
          className="object-contain"
          height={120}
          src="/gmslogo.png"
          width={200}
        />
        <div className="text-right">
          <p className="text-lg text-white">{productTitle}</p>
          <p className="text-xs text-zinc-400 uppercase tracking-widest">
            {productId}
          </p>
        </div>
      </header>

      <div className="mt-3 grid gap-3 rounded-gm-8 bg-zinc-50 p-4 sm:grid-cols-3">
        <LabelValue label="Date Issued" value={dateIssued} />
        <LabelValue label="Valid From" value={validFrom} />
        <LabelValue label="Valid Until" value={validUntil} />
      </div>

      {/* HEADLINE */}

      <section className="mt-3 rounded-gm-8 bg-zinc-900 p-4 text-white">
        <p className="text-xs uppercase tracking-widest">Forecast Headline</p>
        <p className="mt-2 text-base">{headline}</p>
      </section>

      {/* WHAT TO EXPECT */}

      {/* {whatToExpect && (
        <section className="mt-8 space-y-3">
          <SectionTitle>What to Expect</SectionTitle>

          <ul className="space-y-2 text-sm">
            {whatToExpect.map((item, i) => (
              <li key={i}>- {item}</li>
            ))}
          </ul>
        </section>
      )} */}

      {/* SYNOPSIS */}

      <section className="mt-4 space-y-3">
        <SectionTitle>Synopsis</SectionTitle>
        <p className="text-sm">{synopsis}</p>
      </section>

      {/* FURTHER DETAILS */}

      {/* {furtherDetails && (
        <section className="mt-8 space-y-3">
          <SectionTitle>Further Details</SectionTitle>
          <p className="text-sm">{furtherDetails}</p>
        </section>
      )} */}

      {/* PUBLIC FORECAST */}

      <section className="mt-4 space-y-4">
        <SectionTitle>Public Forecast</SectionTitle>

        <div className="grid grid-cols-1 gap-x-10 gap-y-3 rounded-gm-8 p-6 ring-1 ring-zinc-900/5 sm:grid-cols-2">
          {/* <MetricItem icon={Cloud} label="Weather" value={weather} />
          <MetricItem icon={Info} label="Details" value={weatherDetails} /> */}
          <MetricItem
            icon={Thermometer}
            label="Maximum Temperature"
            value={maxTemperature}
          />
          <MetricItem
            icon={Thermometer}
            label="Minimum Temperature"
            value={minTemperature}
          />
          <MetricItem
            icon={Wind}
            label="Wind"
            value={
              windDirectionMin &&
              windDirectionMax &&
              windSpeedMin != null &&
              windSpeedMax != null
                ? `${windDirectionMin}'ly to ${windDirectionMax}'ly @ ${windSpeedMin}–${windSpeedMax} ${windSpeedUnit ?? "mph"}${windSpeedGusting ? `, ${windSpeedGusting}` : ""}`
                : undefined
            }
          />
          <MetricItem icon={Anchor} label="Sea State" value={seas} />

          <MetricItem icon={Waves} label="Wave Heights" value={waveHeights} />
          <MetricItem icon={Wind} label="Swell" value={swell} />
          <MetricItem icon={Sunrise} label="Sunrise" value={sunrise} />
          <MetricItem icon={Sunset} label="Sunset" value={sunset} />

          <MetricItem icon={ArrowDown} label="Low Tide" value={tideLow} />
          <MetricItem icon={ArrowUp} label="High Tide" value={tideHigh} />
          {/* <MetricItem
            icon={AlertCircle}
            label="Marine Advisory"
            value={marineAdvisory}
          /> */}
        </div>
      </section>

      {/* IMPACTS + ACTION */}
      {(impacts || recommendedActions) && (
        <section className="mt-4 space-y-4">
          <SectionTitle>Alerts</SectionTitle>

          <div className="grid gap-8 sm:grid-cols-2">
            {impacts && (
              <section className="">
                <div className="border-gm-warning-amber-border border-l-4 bg-gm-warning-amber-bg px-4 py-2 text-gm-warning-amber-fg">
                  <h2 className="font-semibold text-gm-label uppercase tracking-widest">
                    Impact
                  </h2>
                </div>

                {impacts.map((item) => (
                  <ImpactAlert item={item} key={item.hazard} />
                ))}
              </section>
            )}

            {recommendedActions && (
              <section className="">
                <div className="border-gm-warning-yellow-border border-l-4 bg-gm-warning-yellow-bg px-4 py-2 text-gm-warning-yellow-fg">
                  <h2 className="font-semibold text-gm-label uppercase tracking-widest">
                    Response
                  </h2>
                </div>

                <ul className="space-y-2 text-sm">
                  {recommendedActions.map((a) => (
                    <li key={a}>- {a}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
      )}

      {/* FOOTER */}

      <footer className="mt-2 border-t pt-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">
            Issued By{" "}
            <span className="font-semibold text-sm text-zinc-900 normal-case tracking-normal">
              {forecasterName}
            </span>
          </p>

          <p className="text-xs text-zinc-500 uppercase tracking-widest">
            Next Update{" "}
            <span className="font-normal text-sm text-zinc-900 normal-case tracking-normal">
              {nextUpdate}
            </span>
          </p>
        </div>

        {updateStatement && (
          <p className="mt-2 text-xs text-zinc-600">{updateStatement}</p>
        )}

        <p className="text-xs text-zinc-400">{footerNote}</p>
      </footer>
    </article>
  );
}
