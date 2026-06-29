export interface ShiftValues {
  dateReturnShift: string;
  dateShiftRequested: string;
  department: string;
  exchangeEmployee: string;
  reason: string;
  requestingEmployee: string;
}

export const EMPTY_SHIFT: ShiftValues = {
  department: "",
  requestingEmployee: "",
  exchangeEmployee: "",
  dateShiftRequested: "",
  dateReturnShift: "",
  reason: "",
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

/** Static shift-exchange requisition document, driven by `values` — no backend. */
export function ShiftExchangeDocument({ values }: { values: ShiftValues }) {
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
          SHIFT EXCHANGE REQUISITION FORM
        </h1>
      </header>

      <dl className="space-y-3 text-sm">
        <Row label="Department" value={values.department} />
        <Row
          label="Name of employee requesting change"
          value={values.requestingEmployee}
        />
        <Row
          label="Name of employee with whom change is desired"
          value={values.exchangeEmployee}
        />
        <Row
          label="Date & shift requested for change"
          value={values.dateShiftRequested}
        />
        <Row label="Date of return shift" value={values.dateReturnShift} />
        <Row label="Reason(s) for request" value={values.reason} />
      </dl>

      <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8">
        <SignatureLine label="Requesting Employee Signature" />
        <SignatureLine label="Agreeing Employee Signature" />
        <SignatureLine label="Supervisor Signature" />
        <SignatureLine label="Date" />
      </div>

      <div className="mt-10 border-zinc-900 border-t pt-3">
        <div className="font-semibold text-sm">For Official Use Only</div>
        <div className="mt-4 grid grid-cols-2 gap-x-10 gap-y-8">
          <SignatureLine label="Approved (Manager of Department)" />
          <SignatureLine label="Date" />
        </div>
      </div>
    </div>
  );
}
