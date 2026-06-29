import { Paper } from "@/components/document/paper";

export interface HourlyRow {
  id: string;
  rainChance: string;
  temperature: string;
  time: string;
  weather: string;
  windDirection: string;
  windSpeed: string;
}

export interface HourlyValues {
  date: string;
  forecasterName: string;
  location: string;
  rows: HourlyRow[];
}

export const HOURLY_COLUMNS: {
  key: keyof Omit<HourlyRow, "id">;
  label: string;
}[] = [
  { key: "time", label: "Time" },
  { key: "weather", label: "Weather" },
  { key: "temperature", label: "Temp (°C)" },
  { key: "windDirection", label: "Wind Dir" },
  { key: "windSpeed", label: "Wind (mph)" },
  { key: "rainChance", label: "Rain (%)" },
];

export const EMPTY_HOURLY_ROW: HourlyRow = {
  id: "",
  time: "",
  weather: "",
  temperature: "",
  windDirection: "",
  windSpeed: "",
  rainChance: "",
};

export const EMPTY_HOURLY: HourlyValues = {
  date: "",
  location: "Grenada, Carriacou & Petite Martinique",
  forecasterName: "",
  rows: [],
};

/** Static hourly forecast document — driven by `values`. */
export function HourlyDocument({ values }: { values: HourlyValues }) {
  return (
    <Paper className="flex flex-col px-8 py-9 text-zinc-900">
      <header className="mb-6">
        <div className="font-semibold text-lg tracking-wide">
          GRENADA METEOROLOGICAL SERVICE
        </div>
        <h1 className="mt-1 font-bold text-xl">Hourly Weather Forecast</h1>
        <div className="mt-1 text-sm text-zinc-600">{values.location}</div>
        {values.date ? (
          <div className="text-sm text-zinc-600">For {values.date}</div>
        ) : null}
      </header>

      {values.rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No hours added.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-center text-xs">
          <thead>
            <tr className="bg-zinc-100">
              {HOURLY_COLUMNS.map((col) => (
                <th
                  className="border border-zinc-300 px-1 py-1.5 font-semibold leading-tight"
                  key={col.key}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.rows.map((row) => (
              <tr key={row.id}>
                {HOURLY_COLUMNS.map((col) => (
                  <td
                    className="h-7 border border-zinc-300 px-1 align-middle"
                    key={col.key}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-auto flex items-end justify-between gap-4 pt-10">
        <div className="flex flex-col gap-1">
          <span className="h-6 w-64 border-zinc-400 border-b">
            {values.forecasterName}
          </span>
          <span className="text-xs text-zinc-500">Forecaster on Duty</span>
        </div>
      </footer>
    </Paper>
  );
}
