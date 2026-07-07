import { Paper } from "@/components/document/paper";

// Impact-Based Forecast model — a modern take on the ForecastBook text product.
// Print-only (no persistence): the editor drives this document, nothing more.

export const IBF_LEVELS = [
  "Minimal",
  "Minor",
  "Significant",
  "Severe",
] as const;
export type IbfLevel = (typeof IBF_LEVELS)[number];

export const IBF_HAZARDS = [
  { id: "rainfall", label: "Rainfall" },
  { id: "wind", label: "Wind" },
  { id: "seas", label: "Seas" },
  { id: "heat", label: "Heat" },
  { id: "dust", label: "Dust" },
] as const;
export type IbfHazard = (typeof IBF_HAZARDS)[number]["id"];

export const LIKELIHOODS = [
  "Unlikely",
  "Possible",
  "Likely",
  "Very Likely",
] as const;

export const WX_WARNINGS = [
  "No Weather-related Alert",
  "Heavy Rainfall Advisory",
  "Flash Flood Watch",
  "Flash Flood Warning",
  "Thunderstorm Advisory",
];
export const WIND_WARNINGS = [
  "No Wind-related Alert",
  "Wind Advisory",
  "Small Craft Advisory",
];
export const MARINE_WARNINGS = [
  "No Marine-related Alert",
  "Small Craft Advisory",
  "High Surf Advisory",
  "Marine Warning",
];
export const TIDE_RISKS = ["Low", "Moderate", "High"];

export interface ForecastValues {
  dateIssued: string;
  forecasterName: string;
  highTide: string;
  ibf: Record<IbfHazard, IbfLevel>;
  issueTime: string;
  likelihood: string;
  location: string;
  lowTide: string;
  marineImpact: string;
  marineWarning: string;
  maxTemperature: string;
  minTemperature: string;
  seaState: string;
  summary: string;
  sunrise: string;
  sunset: string;
  tideRisk: string;
  validity: string;
  weatherImpact1: string;
  weatherImpact2: string;
  windDirection: string;
  windImpact1: string;
  windImpact2: string;
  windSpeed: string;
  windWarning: string;
  wxWarning: string;
}

export const EMPTY_FORECAST: ForecastValues = {
  dateIssued: "",
  issueTime: "",
  validity: "Today & tonight (6:00 am – 6:00 am)",
  location: "Grenada, Carriacou & Petite Martinique",
  forecasterName: "",
  likelihood: "Likely",
  ibf: {
    rainfall: "Minimal",
    wind: "Minimal",
    seas: "Minimal",
    heat: "Minimal",
    dust: "Minimal",
  },
  summary: "",
  wxWarning: "No Weather-related Alert",
  maxTemperature: "",
  minTemperature: "",
  weatherImpact1: "",
  weatherImpact2: "",
  windDirection: "",
  windSpeed: "",
  windWarning: "No Wind-related Alert",
  windImpact1: "",
  windImpact2: "",
  seaState: "",
  marineWarning: "No Marine-related Alert",
  marineImpact: "",
  highTide: "",
  lowTide: "",
  tideRisk: "Low",
  sunrise: "",
  sunset: "",
};

// Impact-severity tone for the printed level chips. Papers stay light in both
// themes, so these use the light `--gm-warning-*` token pairs.
export const levelTone: Record<string, string> = {
  Minimal: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  Minor: "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  Significant: "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  Severe: "bg-gm-warning-red-bg text-gm-warning-red-fg",
};

const IBF_LABEL: Record<string, string> = {
  rainfall: "Rainfall",
  wind: "Wind",
  seas: "Seas",
  heat: "Heat",
  dust: "Dust",
};

function isActiveWarning(warning: string): boolean {
  return warning !== "" && !warning.startsWith("No ");
}

function Line({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 font-semibold text-zinc-500">{label}</span>
      <span className="whitespace-pre-wrap text-zinc-900">{value}</span>
    </div>
  );
}

/** Static impact-based forecast product, driven by `values` — no backend. */
export function ForecastDocument({
  period,
  values,
}: {
  period: string;
  values: ForecastValues;
}) {
  return (
    <Paper className="px-12 py-10 text-sm text-zinc-900">
      <header className="mb-5">
        <div className="font-semibold text-lg tracking-wide">
          GRENADA METEOROLOGICAL SERVICE
        </div>
        <h1 className="mt-1 font-bold text-xl">
          {period} Impact-Based Forecast
        </h1>
        <div className="mt-1 text-sm text-zinc-600">{values.location}</div>
      </header>

      <div className="grid grid-cols-3 gap-4 border-zinc-200 border-y py-3">
        <Line label="Date" value={values.dateIssued} />
        <Line label="Issued" value={values.issueTime} />
        <Line label="Validity" value={values.validity} />
      </div>

      <section className="mt-5">
        <div className="mb-2 font-semibold">Impact outlook</div>
        <div className="flex flex-wrap gap-2">
          {IBF_HAZARDS.map((hz) => (
            <span
              className={`rounded-full px-2.5 py-0.5 font-medium text-xs ${
                levelTone[values.ibf[hz.id]] ?? ""
              }`}
              key={hz.id}
            >
              {IBF_LABEL[hz.id]}: {values.ibf[hz.id]}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 flex flex-col gap-1.5">
        <div className="font-semibold">Weather</div>
        <Line label="Summary" value={values.summary} />
        {isActiveWarning(values.wxWarning) ? (
          <Line label="Warning" value={values.wxWarning} />
        ) : null}
        <div className="flex gap-2 text-sm">
          <span className="w-28 shrink-0 font-semibold text-zinc-500">
            Temperature
          </span>
          <span className="text-zinc-900">
            Max {values.maxTemperature || "—"} · Min{" "}
            {values.minTemperature || "—"}
          </span>
        </div>
        <Line label="Impact 1" value={values.weatherImpact1} />
        <Line label="Impact 2" value={values.weatherImpact2} />
      </section>

      <section className="mt-5 flex flex-col gap-1.5">
        <div className="font-semibold">Winds</div>
        <div className="flex gap-2 text-sm">
          <span className="w-28 shrink-0 font-semibold text-zinc-500">
            Wind
          </span>
          <span className="text-zinc-900">
            {values.windDirection || "—"} at {values.windSpeed || "—"}
          </span>
        </div>
        {isActiveWarning(values.windWarning) ? (
          <Line label="Warning" value={values.windWarning} />
        ) : null}
        <Line label="Impact 1" value={values.windImpact1} />
        <Line label="Impact 2" value={values.windImpact2} />
      </section>

      <section className="mt-5 flex flex-col gap-1.5">
        <div className="font-semibold">Seas &amp; Marine</div>
        <Line label="Sea state" value={values.seaState} />
        {isActiveWarning(values.marineWarning) ? (
          <Line label="Warning" value={values.marineWarning} />
        ) : null}
        <Line label="Impact" value={values.marineImpact} />
      </section>

      <section className="mt-5 flex flex-col gap-1.5">
        <div className="font-semibold">Tides &amp; Astronomy</div>
        <Line label="High tide" value={values.highTide} />
        <Line label="Low tide" value={values.lowTide} />
        <div className="flex gap-2 text-sm">
          <span className="w-28 shrink-0 font-semibold text-zinc-500">Sun</span>
          <span className="text-zinc-900">
            Rise {values.sunrise || "—"} · Set {values.sunset || "—"}
          </span>
        </div>
      </section>

      <footer className="mt-8 flex items-end justify-between gap-4 border-zinc-200 border-t pt-4">
        <div className="flex flex-col gap-1">
          <span className="h-6 w-64 border-zinc-400 border-b font-medium">
            {values.forecasterName}
          </span>
          <span className="text-xs text-zinc-500">Forecaster on Duty</span>
        </div>
      </footer>
    </Paper>
  );
}
