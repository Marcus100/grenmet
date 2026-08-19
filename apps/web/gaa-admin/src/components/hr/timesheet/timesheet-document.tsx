import { Paper } from "@/components/document/paper";

export interface TimesheetRow {
  actualHours: string;
  breakHours: string;
  date: string;
  hoursWorked: string;
  id: string;
  name: string;
  remarks: string;
  rosterHours: string;
  totalHours: string;
}

export interface TimesheetValues {
  department: string;
  period: string;
  rows: TimesheetRow[];
}

export const TIMESHEET_COLUMNS: {
  key: keyof Omit<TimesheetRow, "id">;
  label: string;
}[] = [
  { key: "date", label: "DATE" },
  { key: "name", label: "NAME" },
  { key: "rosterHours", label: "ROSTER HRS" },
  { key: "actualHours", label: "ACTUAL HRS" },
  { key: "totalHours", label: "TOTAL HRS" },
  { key: "breakHours", label: "BREAK HRS" },
  { key: "hoursWorked", label: "HRS WORKED" },
  { key: "remarks", label: "REMARKS" },
];

export const EMPTY_TIMESHEET_ROW: TimesheetRow = {
  id: "",
  date: "",
  name: "",
  rosterHours: "",
  actualHours: "",
  totalHours: "",
  breakHours: "",
  hoursWorked: "",
  remarks: "",
};

export const EMPTY_TIMESHEET: TimesheetValues = {
  department: "",
  period: "",
  rows: [],
};

const MIN_ROWS = 16;

/** Static official time sheet document — driven by `values`, fills to a full page. */
export function TimesheetDocument({ values }: { values: TimesheetValues }) {
  const blanks = Math.max(0, MIN_ROWS - values.rows.length);

  return (
    <Paper className="flex flex-col px-8 py-8 text-zinc-900">
      <header className="mb-6 text-center">
        <div className="font-semibold text-base">
          GRENADA AIRPORTS AUTHORITY
        </div>
        <div className="font-semibold text-sm">
          MAURICE BISHOP INTERNATIONAL AIRPORT & LAURISTON AIRPORT
        </div>
        <h1 className="mt-1 font-bold text-lg">OFFICIAL TIME SHEET</h1>
      </header>

      <div className="mb-4 flex justify-between text-sm">
        <span className="flex items-end gap-2 font-semibold">
          DEPARTMENT:
          <span className="min-w-28 border-zinc-900 border-b font-normal">
            {values.department || " "}
          </span>
        </span>
        <span className="flex items-end gap-2 font-semibold">
          PERIOD:
          <span className="min-w-28 border-zinc-900 border-b font-normal">
            {values.period || " "}
          </span>
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-center text-[10px]">
        <thead>
          <tr>
            {TIMESHEET_COLUMNS.map((col) => (
              <th
                className="border border-zinc-900 px-0.5 py-1 font-semibold leading-tight"
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
              {TIMESHEET_COLUMNS.map((col) => (
                <td
                  className="h-6 border border-zinc-900 px-0.5 align-middle"
                  key={col.key}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => `blank-${i}`).map((id) => (
            <tr key={id}>
              {TIMESHEET_COLUMNS.map((col) => (
                <td className="h-6 border border-zinc-900" key={col.key} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 flex justify-center">
        <div className="w-1/2 text-center text-sm">
          <div className="mb-1 border-zinc-900 border-b" />
          <span>Department Manager / Supervisor</span>
        </div>
      </div>

      <div className="mt-auto space-y-0.5 pt-6 text-[10px] leading-tight">
        <p>
          (a) To be completed each shift per day and{" "}
          <span className="underline">
            submitted weekly to the Human Resource Department
          </span>
        </p>
        <p>(b) All staff movement must be accounted for.</p>
        <p>(c) Brief explanation to be provided in the Remarks column.</p>
        <p>(d) Medical certificates to be attached where necessary.</p>
      </div>
    </Paper>
  );
}
