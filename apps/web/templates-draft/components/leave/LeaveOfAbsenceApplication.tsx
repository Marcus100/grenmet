interface LeaveOfAbsenceApplicationProps {
  organization?: string;
  subtitle?: string;
  location?: string;
  establishedYear?: string;
  title?: string;
  leaveTypes?: string[];
}

const defaultLeaveTypes = [
  "Annual Vacation",
  "Maternity Leave",
  "Professional Appointment",
  "Family Bereavement",
  "Paternity Leave",
  "Bank | Medical | Legal Dental",
];

function InlineField({
  label,
  lineClass = "w-full",
}: {
  label: string;
  lineClass?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <span className="text-[19px] text-zinc-900">{label}</span>
      <span className={`h-7 border-b border-zinc-900 ${lineClass}`} />
    </div>
  );
}

function CheckLabel({ text }: { text: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[19px] text-zinc-900">
      <span>{text}</span>
      <span className="h-5 w-5 border border-zinc-700" />
    </label>
  );
}

export default function LeaveOfAbsenceApplication({
  organization = "GRENADA AIRPORTS AUTHORITY",
  subtitle = "Maurice Bishop International Airport",
  location = "St. George's, Grenada, West Indies",
  establishedYear = "Established 1985",
  title = "APPLICATION FOR LEAVE OF ABSENCE",
  leaveTypes = defaultLeaveTypes,
}: LeaveOfAbsenceApplicationProps) {
  return (
    <div className="rounded-xl bg-white p-7 shadow-sm ring-1 ring-zinc-900/5">
      <header className="mb-6 text-center">
        <div className="text-[35px] font-semibold tracking-wide text-zinc-900">
          {organization}
        </div>
        <div className="text-[30px] font-semibold text-zinc-900">{subtitle}</div>
        <div className="text-[30px] text-zinc-900">{location}</div>
        <div className="mt-2 text-[24px] text-zinc-700">[{establishedYear}]</div>
        <h1 className="mt-3 text-[34px] font-bold tracking-wide text-zinc-900">
          {title}
        </h1>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-x-10 gap-y-3">
        <InlineField label="Employee Name:" />
        <InlineField label="Department:" />
        <InlineField label="Employee request for leave:" lineClass="w-28" />
        <InlineField label="Start Date:" lineClass="w-44" />
        <div />
        <InlineField label="End Date:" lineClass="w-44" />
      </section>

      <section className="mb-4">
        <h2 className="mb-3 text-center text-[30px] font-bold text-zinc-900">
          TYPE OF LEAVE OF ABSENCE
        </h2>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2">
          {leaveTypes.map((type) => (
            <CheckLabel key={type} text={type} />
          ))}
          <div className="col-span-2 flex items-end gap-2">
            <CheckLabel text="Other" />
            <span className="text-[19px] text-zinc-900">Please state reason:</span>
            <span className="h-7 w-56 border-b border-zinc-900" />
          </div>
        </div>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-x-10 gap-y-2">
        <div className="flex items-end gap-3">
          <span className="text-[19px] text-zinc-900">Salary in advance</span>
          <CheckLabel text="Yes" />
          <CheckLabel text="No" />
        </div>
        <div />
        <InlineField label="Where is the leave to be spent:" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <InlineField label="From:" />
          <span className="text-[19px] text-zinc-900">To:</span>
          <span className="h-7 border-b border-zinc-900" />
        </div>
        <InlineField label="Employee Signature:" />
        <InlineField label="Date:" lineClass="w-44" />
      </section>

      <section className="mb-4 border-y-2 border-zinc-900 py-2">
        <div className="mb-2 flex items-end gap-3 text-[18px] text-zinc-900">
          <span>Will require acting appointment</span>
          <CheckLabel text="Yes" />
          <CheckLabel text="No" />
          <span>Leave approved as requested</span>
          <span className="h-5 w-5 border border-zinc-700" />
        </div>
        <div className="mb-2 flex items-end gap-3 text-[18px] text-zinc-900">
          <span>Leave Denied</span>
          <span className="h-5 w-5 border border-zinc-700" />
          <span>Leave approved with changes</span>
          <span className="h-5 w-5 border border-zinc-700" />
          <InlineField label="Start Date:" lineClass="w-28" />
          <InlineField label="End Date:" lineClass="w-28" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-[19px] text-zinc-900">Comments:</span>
          <span className="h-7 flex-1 border-b border-zinc-900" />
        </div>
      </section>

      <section className="mb-4 grid grid-cols-[1fr_auto_1fr] items-end gap-x-4 gap-y-2">
        <InlineField label="Supervisor's Signature:" />
        <span className="text-[19px] text-zinc-900">Date:</span>
        <span className="h-7 border-b border-zinc-900" />

        <InlineField label="Dept. Manager's Signature:" />
        <span className="text-[19px] text-zinc-900">Date:</span>
        <span className="h-7 border-b border-zinc-900" />

        <InlineField label="Divisional Director of Operations Signature:" />
        <span className="text-[19px] text-zinc-900">Date:</span>
        <span className="h-7 border-b border-zinc-900" />

        <InlineField label="CEO's Signature:" />
        <span className="text-[19px] text-zinc-900">Date:</span>
        <span className="h-7 border-b border-zinc-900" />
      </section>

      <section className="border-t-2 border-zinc-900 pt-2">
        <h3 className="mb-2 text-center text-[30px] font-bold leading-tight text-zinc-900">
          APPROVAL
          <br />
          HUMAN RESOURCES DEPT. OFFICIAL ONLY
        </h3>
        <div className="mb-2 grid grid-cols-4 items-end gap-3">
          <InlineField label="Previous Balance" />
          <InlineField label="Days requested" />
          <InlineField label="New Balance" />
          <InlineField label="as at" />
        </div>
        <div className="mb-3 flex items-end gap-2">
          <span className="text-[19px] text-zinc-900">
            You are expected to return to work
          </span>
          <span className="h-7 flex-1 border-b border-zinc-900" />
        </div>
        <div className="grid grid-cols-2 gap-8">
          <InlineField label="Signature:" lineClass="w-64" />
          <InlineField label="Date:" lineClass="w-40" />
        </div>
      </section>
    </div>
  );
}
