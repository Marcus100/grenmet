import { Paper } from "@/components/document/paper";

export interface DailyStatusValues {
  absenteeism: string;
  affectedEfficiency: string;
  affectedExplain: string;
  allReported: string;
  comments: string;
  date: string;
  department: string;
  notReportedExplain: string;
  shift: string;
}

export const SHIFT_OPTIONS = ["A.M.", "P.M."];
export const YES_NO = ["Yes", "No"];

export const EMPTY_DAILY_STATUS: DailyStatusValues = {
  department: "",
  date: "",
  shift: "A.M.",
  absenteeism: "",
  allReported: "Yes",
  notReportedExplain: "",
  affectedEfficiency: "No",
  affectedExplain: "",
  comments: "",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-zinc-500">{label}:</span>
      <span className="min-w-0 flex-1 border-zinc-300 border-b font-medium text-zinc-900">
        {value || " "}
      </span>
    </div>
  );
}

function QA({
  q,
  a,
  explainLabel,
  explain,
}: {
  q: string;
  a: string;
  explainLabel: string;
  explain: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="flex-1">{q}</span>
        <span className="font-semibold">{a}</span>
      </div>
      {explain ? (
        <div className="flex items-baseline gap-2 pl-4 text-zinc-700">
          <span className="shrink-0 text-zinc-500">{explainLabel}:</span>
          <span className="min-w-0 flex-1 border-zinc-300 border-b">
            {explain}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Static daily airport status report, driven by `values` — no backend. */
export function DailyStatusDocument({ values }: { values: DailyStatusValues }) {
  return (
    <Paper className="px-12 py-10 text-sm">
      <header className="mb-6 text-center">
        <div className="font-semibold text-xl tracking-wide">
          GRENADA AIRPORTS AUTHORITY
        </div>
        <div className="text-sm">Maurice Bishop International Airport</div>
        <div className="text-sm text-zinc-600">
          St. George&apos;s, Grenada, West Indies
        </div>
        <h1 className="mt-3 font-bold text-lg tracking-wide">
          DAILY AIRPORT STATUS REPORT
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
        <Row label="Department" value={values.department} />
        <Row label="Date" value={values.date} />
        <Row label="Shift" value={values.shift} />
        <Row label="Absenteeism" value={values.absenteeism} />
      </dl>

      <div className="mt-6">
        <div className="mb-2 font-semibold text-sm">PERSONNEL</div>
        <div className="space-y-3 text-sm">
          <QA
            a={values.allReported}
            explain={values.notReportedExplain}
            explainLabel="If No, please explain"
            q="a) Have all persons scheduled for the shift reported on time?"
          />
          <QA
            a={values.affectedEfficiency}
            explain={values.affectedExplain}
            explainLabel="If Yes, please explain"
            q="c) Has this affected the status / efficiency of your operations?"
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1 font-semibold text-sm">
          Operational status comments
        </div>
        <p className="min-h-20 whitespace-pre-wrap border-zinc-300 border-b text-sm">
          {values.comments || " "}
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8">
        <div className="flex flex-col gap-1">
          <span className="h-6 border-zinc-400 border-b" />
          <span className="text-xs text-zinc-500">Officer on Duty</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="h-6 border-zinc-400 border-b" />
          <span className="text-xs text-zinc-500">Date</span>
        </div>
      </div>
    </Paper>
  );
}
