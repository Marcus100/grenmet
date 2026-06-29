import { Paper } from "@/components/document/paper";

export interface MarineBulletinValues {
  date: string;
  forecasterName: string;
  seaState: string;
  sunrise: string;
  sunset: string;
  synopsis: string;
  tideHigh1: string;
  tideHigh2: string;
  tideLow: string;
  time: string;
  validity: string;
  visibility: string;
  warningLevel: string;
  weather: string;
  wind: string;
}

export const WARNING_LEVELS = ["Green", "Yellow", "Amber", "Red"];

export const EMPTY_MARINE_BULLETIN: MarineBulletinValues = {
  date: "",
  time: "",
  validity: "24 hours",
  warningLevel: "Green",
  synopsis: "",
  weather: "",
  seaState: "",
  visibility: "",
  wind: "",
  tideHigh1: "",
  tideLow: "",
  tideHigh2: "",
  sunrise: "",
  sunset: "",
  forecasterName: "",
};

const warningTone: Record<string, string> = {
  green:
    "border-gm-warning-green-border bg-gm-warning-green-bg text-gm-warning-green-fg",
  yellow:
    "border-gm-warning-yellow-border bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  amber:
    "border-gm-warning-amber-border bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  red: "border-gm-warning-red-border bg-gm-warning-red-bg text-gm-warning-red-fg",
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

/** Static marine weather bulletin, driven by `values` — no backend. */
export function MarineBulletinDocument({
  values,
}: {
  values: MarineBulletinValues;
}) {
  const tone =
    warningTone[values.warningLevel.toLowerCase()] ?? warningTone.green;

  return (
    <Paper className="px-12 py-10 text-sm">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-lg tracking-wide">
            GRENADA METEOROLOGICAL SERVICE
          </div>
          <h1 className="mt-1 font-bold text-xl">Marine Weather Bulletin</h1>
        </div>
        <div
          className={`rounded-md border px-3 py-1.5 text-center font-semibold text-sm ${tone}`}
        >
          {values.warningLevel} Warning
        </div>
      </header>

      <div className="grid grid-cols-3 gap-6 text-sm">
        <Field label="Date" value={values.date} />
        <Field label="Time" value={values.time} />
        <Field label="Validity" value={values.validity} />
      </div>

      <section className="mt-6">
        <div className="mb-1 font-semibold text-sm">Synopsis</div>
        <p className="min-h-16 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm">
          {values.synopsis || " "}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <Field label="Weather" value={values.weather} />
        <Field label="Sea State" value={values.seaState} />
        <Field label="Visibility" value={values.visibility} />
        <Field label="Wind" value={values.wind} />
      </section>

      <section className="mt-6">
        <div className="mb-2 font-semibold text-sm">Tides</div>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <Field label="High Tide 1" value={values.tideHigh1} />
          <Field label="Low Tide" value={values.tideLow} />
          <Field label="High Tide 2" value={values.tideHigh2} />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <Field label="Sunrise" value={values.sunrise} />
        <Field label="Sunset" value={values.sunset} />
      </section>

      <footer className="mt-10 flex flex-col gap-1">
        <span className="h-6 w-64 border-zinc-400 border-b">
          {values.forecasterName}
        </span>
        <span className="text-xs text-zinc-500">Forecaster on Duty</span>
      </footer>
    </Paper>
  );
}
