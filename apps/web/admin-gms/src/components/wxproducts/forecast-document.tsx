export interface ForecastImpact {
  details: string;
  hazard: string;
  id: string;
  impactLevel: string;
  likelihoodLevel: string;
  responseLevel: string;
}

export interface ForecastValues {
  dateIssued: string;
  forecasterName: string;
  headline: string;
  impacts: ForecastImpact[];
  location: string;
  marineAdvisory: string;
  maxTemperature: string;
  minTemperature: string;
  nextUpdate: string;
  summary: string;
}

export const IMPACT_LEVELS = ["Minor", "Moderate", "Severe", "Extreme"];
export const LIKELIHOOD_LEVELS = [
  "Very Low",
  "Low",
  "Medium",
  "High",
  "Very High",
];
export const RESPONSE_LEVELS = ["Be Aware", "Be Prepared", "Take Action"];

export const EMPTY_IMPACT: ForecastImpact = {
  id: "",
  hazard: "",
  impactLevel: "Minor",
  likelihoodLevel: "Low",
  responseLevel: "Be Aware",
  details: "",
};

export const EMPTY_FORECAST: ForecastValues = {
  dateIssued: "",
  location: "Grenada, Carriacou & Petite Martinique",
  headline: "",
  summary: "",
  minTemperature: "",
  maxTemperature: "",
  marineAdvisory: "",
  nextUpdate: "",
  forecasterName: "",
  impacts: [],
};

const responseTone: Record<string, string> = {
  "be aware":
    "border-gm-warning-yellow-border bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  "be prepared":
    "border-gm-warning-amber-border bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  "take action":
    "border-gm-warning-red-border bg-gm-warning-red-bg text-gm-warning-red-fg",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="border-zinc-200 border-b pb-0.5 font-medium text-zinc-900">
        {value || " "}
      </span>
    </div>
  );
}

/** Static public weather forecast document, driven by `values` — no backend. */
export function ForecastDocument({
  period,
  values,
}: {
  period: string;
  values: ForecastValues;
}) {
  return (
    <div
      className="rounded-xl border bg-white p-8 text-zinc-900 shadow-sm"
      data-print-paper
    >
      <header className="mb-6">
        <div className="font-semibold text-lg tracking-wide">
          GRENADA METEOROLOGICAL SERVICE
        </div>
        <h1 className="mt-1 font-bold text-xl">{period} Weather Forecast</h1>
        <div className="mt-1 text-sm text-zinc-600">{values.location}</div>
      </header>

      <div className="grid grid-cols-3 gap-6 text-sm">
        <Field label="Date Issued" value={values.dateIssued} />
        <Field label="Min Temp" value={values.minTemperature} />
        <Field label="Max Temp" value={values.maxTemperature} />
      </div>

      {values.headline ? (
        <p className="mt-6 font-semibold text-base">{values.headline}</p>
      ) : null}

      <section className="mt-4">
        <div className="mb-1 font-semibold text-sm">Summary</div>
        <p className="min-h-16 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm">
          {values.summary || " "}
        </p>
      </section>

      <section className="mt-6">
        <div className="mb-2 font-semibold text-sm">Impacts</div>
        {values.impacts.length === 0 ? (
          <p className="text-sm text-zinc-400">No impacts added.</p>
        ) : (
          <div className="space-y-3">
            {values.impacts.map((imp) => {
              const tone =
                responseTone[imp.responseLevel.toLowerCase()] ??
                "border-zinc-300 bg-zinc-50";
              return (
                <div
                  className={`rounded-md border p-3 text-sm ${tone}`}
                  key={imp.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {imp.hazard || "Untitled hazard"}
                    </span>
                    <span className="font-medium text-xs">
                      {imp.responseLevel}
                    </span>
                  </div>
                  <div className="mt-1 text-xs">
                    Impact: {imp.impactLevel} · Likelihood:{" "}
                    {imp.likelihoodLevel}
                  </div>
                  {imp.details ? (
                    <p className="mt-1 whitespace-pre-wrap">{imp.details}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {values.marineAdvisory ? (
        <section className="mt-6">
          <div className="mb-1 font-semibold text-sm">Marine Advisory</div>
          <p className="whitespace-pre-wrap text-sm">{values.marineAdvisory}</p>
        </section>
      ) : null}

      <footer className="mt-10 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="h-6 w-64 border-zinc-400 border-b">
            {values.forecasterName}
          </span>
          <span className="text-xs text-zinc-500">Forecaster on Duty</span>
        </div>
        <div className="text-right text-xs text-zinc-500">
          Next update:{" "}
          <span className="font-medium text-zinc-800">
            {values.nextUpdate || "—"}
          </span>
        </div>
      </footer>
    </div>
  );
}
