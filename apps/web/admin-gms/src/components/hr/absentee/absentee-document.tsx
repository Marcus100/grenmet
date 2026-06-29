export interface AbsenteeValues {
  date: string;
  department: string;
  employeeName: string;
  notes: string;
  reason: string;
}

export const ABSENTEE_REASONS = [
  "Uncertified Sick",
  "Illness on the Job",
  "Illness (family member)",
  "Time Off",
  "Other",
];

export const EMPTY_ABSENTEE: AbsenteeValues = {
  employeeName: "",
  department: "",
  date: "",
  reason: "Uncertified Sick",
  notes: "",
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

/** Static absentee report document, driven by `values` — no backend. */
export function AbsenteeDocument({ values }: { values: AbsenteeValues }) {
  return (
    <div
      className="rounded-xl border bg-white p-8 text-zinc-900 shadow-sm"
      data-print-paper
    >
      <header className="mb-6 text-center">
        <div className="font-semibold text-xl tracking-wide">
          GRENADA AIRPORTS AUTHORITY
        </div>
        <div className="text-sm">Maurice Bishop International Airport</div>
        <div className="text-sm text-zinc-600">
          St. George&apos;s, Grenada, West Indies
        </div>
        <h1 className="mt-3 font-bold text-lg tracking-wide">
          ABSENTEE REPORT
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
        <Row label="Employee Name" value={values.employeeName} />
        <Row label="Department" value={values.department} />
        <Row label="Date" value={values.date} />
      </dl>

      <p className="mt-6 text-sm">
        The above employee was absent from work on the above date for the reason
        checked:
      </p>

      <div className="mt-3">
        <div className="mb-2 font-semibold text-sm">CHECK REASON</div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          {ABSENTEE_REASONS.map((r) => {
            const checked = values.reason === r;
            return (
              <span className="flex items-center gap-2" key={r}>
                <span
                  className={`flex size-4 items-center justify-center border text-[10px] ${
                    checked
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-500"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                {r}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1 text-sm text-zinc-500">Reason(s)</div>
        <p className="min-h-16 whitespace-pre-wrap border-zinc-300 border-b text-sm">
          {values.notes || " "}
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8">
        <div className="flex flex-col gap-1">
          <span className="h-6 border-zinc-400 border-b" />
          <span className="text-xs text-zinc-500">
            Supervisor&apos;s Signature
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="h-6 border-zinc-400 border-b" />
          <span className="text-xs text-zinc-500">Date</span>
        </div>
      </div>
    </div>
  );
}
