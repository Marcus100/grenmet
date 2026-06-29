export interface LeaveValues {
  daysRequested: string;
  department: string;
  employeeName: string;
  endDate: string;
  leaveType: string;
  otherReason: string;
  startDate: string;
}

export const LEAVE_TYPES = [
  "Annual Vacation",
  "Maternity Leave",
  "Professional Appointment",
  "Family Bereavement",
  "Paternity Leave",
  "Bank | Medical | Legal Dental",
  "Other",
];

export const EMPTY_LEAVE: LeaveValues = {
  employeeName: "",
  department: "",
  daysRequested: "",
  startDate: "",
  endDate: "",
  leaveType: "Annual Vacation",
  otherReason: "",
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

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="h-6 border-zinc-400 border-b" />
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

/**
 * Static leave-of-absence document. Driven entirely by `values` — no backend.
 * Rendered as the live preview beside the editor and as the print target.
 */
export function LeaveDocument({ values }: { values: LeaveValues }) {
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
        <div className="mt-1 text-xs text-zinc-500">[Established 1985]</div>
        <h1 className="mt-3 font-bold text-lg tracking-wide">
          APPLICATION FOR LEAVE OF ABSENCE
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
        <Row label="Employee Name" value={values.employeeName} />
        <Row label="Department" value={values.department} />
        <Row label="Days Requested" value={values.daysRequested} />
        <Row label="Start Date" value={values.startDate} />
        <div />
        <Row label="End Date" value={values.endDate} />
      </dl>

      <div className="mt-8">
        <div className="mb-3 text-center font-semibold text-base">
          TYPE OF LEAVE OF ABSENCE
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          {LEAVE_TYPES.map((t) => {
            const checked = values.leaveType === t;
            return (
              <span className="flex items-center gap-2" key={t}>
                <span
                  className={`flex size-4 items-center justify-center border text-[10px] ${
                    checked
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-500"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                {t === "Other" && values.leaveType === "Other"
                  ? `Other — ${values.otherReason || "…"}`
                  : t}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8">
        <SignatureLine label="Employee Signature" />
        <SignatureLine label="Date" />
        <SignatureLine label="Supervisor Approval" />
        <SignatureLine label="Date" />
      </div>
    </div>
  );
}
