interface ShiftExchangeRequisitionFormProps {
  contactEmail?: string;
  contactFax?: string;
  contactPhone?: string;
  establishedYear?: string;
  location?: string;
  organization?: string;
  subtitle?: string;
  title?: string;
}

function Rule({
  widthClass = "w-full",
  heightClass = "h-6",
}: {
  widthClass?: string;
  heightClass?: string;
}) {
  return (
    <span className={`${heightClass} ${widthClass} border-zinc-900 border-b`} />
  );
}

function InlineRule({
  label,
  widthClass = "w-full",
}: {
  label: string;
  widthClass?: string;
}) {
  return (
    <div className="flex items-end gap-1.5">
      <span className="text-[15px] text-zinc-900">{label}</span>
      <Rule widthClass={widthClass} />
    </div>
  );
}

function CheckboxLabel({ label }: { label: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[15px] text-zinc-900">
      <span>{label}</span>
      <span className="h-4 w-4 border border-zinc-700" />
    </label>
  );
}

export default function ShiftExchangeRequisitionForm({
  organization = "GRENADA AIRPORTS AUTHORITY",
  subtitle = "Maurice Bishop International Airport",
  location = "St. George's, Grenada, West Indies",
  establishedYear = "Established 1985",
  title = "SHIFT EXCHANGE REQUISITION FORM",
  contactEmail = "gaa@mbiagrenada.com",
  contactPhone = "(473) 444-4101/4555",
  contactFax = "(473) 444-4838",
}: ShiftExchangeRequisitionFormProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      <header className="mb-5 text-center">
        <div className="font-semibold text-xl text-zinc-900 tracking-wide">
          {organization}
        </div>
        <div className="font-semibold text-lg text-zinc-900">{subtitle}</div>
        <div className="text-lg text-zinc-900">{location}</div>
        <div className="mt-2 text-base text-zinc-700">({establishedYear})</div>
        <h1 className="mt-3 font-bold text-2xl text-zinc-900">{title}</h1>
      </header>

      <section className="mb-3 space-y-2">
        <InlineRule label="DEPARTMENT" widthClass="w-20" />
        <InlineRule
          label="NAME OF EMPLOYEE REQUESTING CHANGE"
          widthClass="w-16"
        />
        <InlineRule
          label="NAME OF EMPLOYEE WITH WHOM CHANGE IS DESIRED"
          widthClass="w-12"
        />
        <InlineRule
          label="DATE & SHIFT REQUESTED FOR CHANGE"
          widthClass="w-28"
        />
        <InlineRule label="DATE OF RETURN SHIFT" widthClass="w-16" />
        <InlineRule label="REASON(S) FOR REQUEST" widthClass="w-16" />
      </section>

      <section className="mb-3 space-y-2">
        <InlineRule label="Name of Requesting Employee" widthClass="w-20" />
        <InlineRule
          label="Signature of Requesting Employee"
          widthClass="w-56"
        />
        <InlineRule
          label="Name of Employee Agreeing to the Change"
          widthClass="w-16"
        />
        <InlineRule
          label="Signature of Employee Agreeing to the Change"
          widthClass="w-56"
        />
      </section>

      <section className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-zinc-900">
            Supervisor&apos;s Recommendation:
          </span>
          <CheckboxLabel label="Yes" />
          <CheckboxLabel label="No" />
        </div>
        <InlineRule label="If No, please state reason(s)" widthClass="w-16" />
        <InlineRule label="Supervisor&apos;s Signature" widthClass="w-80" />
      </section>

      <section className="mb-3 border-zinc-900 border-y py-1.5">
        <h2 className="font-semibold text-lg text-zinc-900">
          For Official Use Only
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[15px] text-zinc-900">Approved:</span>
          <CheckboxLabel label="Yes" />
          <CheckboxLabel label="No" />
        </div>
        <div className="mt-2">
          <InlineRule label="If No, please state reason(s)" />
        </div>
        <div className="mt-2">
          <InlineRule
            label="Signature: Manager of Department"
            widthClass="w-56"
          />
        </div>
      </section>

      <section className="border-zinc-900 border-t pt-2">
        <h3 className="mb-2 text-[17px] text-zinc-900">
          Human Resource Department:
        </h3>
        <div className="mb-3 grid grid-cols-2 items-end gap-6">
          <InlineRule label="Date:" widthClass="w-24" />
          <InlineRule label="Signature:" widthClass="w-56" />
        </div>
        <p className="text-[15px] text-zinc-900">
          Email:{" "}
          <a
            className="text-blue-700 underline"
            href={`mailto:${contactEmail}`}
          >
            {contactEmail}
          </a>{" "}
          Telephone: {contactPhone} Fax: {contactFax}
        </p>
      </section>
    </div>
  );
}
