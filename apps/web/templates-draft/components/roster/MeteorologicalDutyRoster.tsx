interface MeteorologicalDutyRosterProps {
  title?: string;
  subtitle?: string;
  period?: string;
  statusTag?: string;
}

const weekDays = ["S", "M", "T", "W", "T", "F", "S"];
const staffNames = [
  "G. Tamar",
  "J. Charles",
  "V. Cyrus",
  "F. Frank",
  "K. Johnson",
  "N. Jones",
  "T. Miller",
  "J. Pryce",
  "E. White",
  "K. Bedeau",
  "K. Clarke",
  "S. Cummings",
  "J. Fleming",
  "Z. Barry",
  "G. Charles",
  "T. Mitchell",
  "T. Tekal",
  "J. McLeod",
  "S. Paterson",
];

function buildDayHeaders(daysInMonth: number) {
  return Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    week: weekDays[i % weekDays.length],
  }));
}

export default function MeteorologicalDutyRoster({
  title = "METEOROLOGICAL DEPARTMENT",
  subtitle = "DUTY ROSTER",
  period = "February 2026",
  statusTag = "CORRECTED",
}: MeteorologicalDutyRosterProps) {
  const dayHeaders = buildDayHeaders(31);

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-900/5">
      <header className="mb-3 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-wide underline">{title}</h1>
        <h2 className="text-2xl font-bold uppercase tracking-wide underline">{subtitle}</h2>
      </header>

      <section className="mb-3 flex items-start justify-between text-[13px] text-zinc-900">
        <div className="space-y-0.5 leading-tight">
          <div className="font-bold">LEGEND:</div>
          <div>M = 0530 hrs to 1400 hrs</div>
          <div>E = 1400 hrs to 2230 hrs</div>
          <div>N = 2230 hrs to 0600 hrs</div>
          <div>O = OFF DUTY</div>
          <div>V = VACATION</div>
          <div>S = STUDY LEAVE</div>
          <div>D = 0800hrs to 1600 hrs</div>
          <div>L = LEAVE (OTHER)</div>
          <div>* - Public Holiday</div>
        </div>
        <div className="pt-8 text-3xl font-semibold">
          PERIOD: <span className="font-bold">{period}</span>{" "}
          <span className="text-red-600">({statusTag})</span>
        </div>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[12px] text-zinc-900">
          <thead>
            <tr>
              <th className="w-36 border border-zinc-900 px-1 py-1 text-left">Names /</th>
              {dayHeaders.map((header) => (
                <th key={`wk-${header.day}`} className="w-6 border border-zinc-900 px-0 py-0.5">
                  {header.week}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border border-zinc-900 px-1 py-1 text-left">Date</th>
              {dayHeaders.map((header) => (
                <th key={`day-${header.day}`} className="border border-zinc-900 px-0 py-0.5">
                  {header.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffNames.map((name) => (
              <tr key={name}>
                <td className="border border-zinc-900 px-1 py-0.5 text-left">{name}</td>
                {dayHeaders.map((header) => (
                  <td key={`${name}-${header.day}`} className="h-5 border border-zinc-900">
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 text-[13px] text-zinc-900">
        <div className="mb-1">
          Signed by: <span className="underline">G. Tamar</span>
        </div>
        <div className="italic">Manager of Meteorology</div>
        <div>Date: 3rd February 2026</div>
      </section>
    </div>
  );
}
