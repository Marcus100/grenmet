interface AbsenteeReportProps {
  establishedYear?: string;
  location?: string;
  noteLineOne?: string;
  noteLineTwo?: string;
  notesHeading?: string;
  organization?: string;
  reasonOptions?: string[];
  subtitle?: string;
  title?: string;
}

const defaultReasonOptions = [
  "Uncertified Sick",
  "Illness on the Job",
  "Other",
  "Illness (family member)",
  "Time Off",
];

function FieldLine({
  label,
  widthClass = "w-full",
}: {
  label: string;
  widthClass?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <span className="font-semibold text-base text-zinc-900">{label}</span>
      <span className={`h-7 border-zinc-900 border-b ${widthClass}`} />
    </div>
  );
}

function WritingLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, idx) => (
        <div className="h-8 border-zinc-800 border-b" key={idx} />
      ))}
    </div>
  );
}

export default function AbsenteeReport({
  organization = "GRENADA AIRPORTS AUTHORITY",
  subtitle = "Maurice Bishop International Airport",
  location = "St. George's, Grenada, West Indies",
  establishedYear = "Established 1985",
  title = "ABSENTEE REPORT",
  reasonOptions = defaultReasonOptions,
  notesHeading = "Please Note:",
  noteLineOne = "A reason must be provided by the employee for uncertified sick or illness on the job and be documented on the form.",
  noteLineTwo = "Supervisors must complete this form each day an employee is absent and send it to the Human Resources Department.",
}: AbsenteeReportProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      <header className="mb-8 text-center">
        <div className="font-semibold text-2xl text-zinc-900 tracking-wide">
          {organization}
        </div>
        <div className="mt-1 font-semibold text-lg text-zinc-900">
          {subtitle}
        </div>
        <div className="text-lg text-zinc-800">{location}</div>
        <div className="mt-3 text-base text-zinc-700">({establishedYear})</div>
        <h1 className="mt-4 font-bold text-2xl text-zinc-900 tracking-wide">
          {title}
        </h1>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <FieldLine label="Employee Name" />
          <FieldLine label="Department" />
        </div>
        <div className="space-y-4">
          <FieldLine label="Date:" widthClass="w-40" />
        </div>
      </section>

      <section className="mb-4">
        <p className="text-lg text-zinc-900">
          The above employee was absent from work on the above date for the
          reason checked:
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-4 font-bold text-xl text-zinc-900">CHECK REASON:</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {reasonOptions.map((reason) => (
            <label
              className="flex items-center gap-2 text-xl text-zinc-900"
              key={reason}
            >
              <span className="h-5 w-5 border border-zinc-700" />
              <span>{reason}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-end gap-2">
          <span className="text-xl text-zinc-900">Reason(s)</span>
          <span className="flex-1 border-zinc-900 border-b" />
        </div>
        <WritingLines rows={4} />
      </section>

      <section className="mb-10 space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
          <FieldLine label="Supervisor's Signature:" />
          <span className="font-semibold text-xl text-zinc-900">Date:</span>
          <span className="h-7 border-zinc-900 border-b" />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
          <FieldLine label="Department Manager Signature:" />
          <span className="font-semibold text-xl text-zinc-900">Date:</span>
          <span className="h-7 border-zinc-900 border-b" />
        </div>
      </section>

      <section className="space-y-3 text-zinc-900">
        <h3 className="font-bold text-xl underline">{notesHeading}</h3>
        <p className="text-lg leading-relaxed">{noteLineOne}</p>
        <p className="text-lg leading-relaxed">{noteLineTwo}</p>
      </section>
    </div>
  );
}
