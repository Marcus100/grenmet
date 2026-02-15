interface DailyAirportStatusReportProps {
  organization?: string;
  subtitle?: string;
  location?: string;
  establishedYear?: string;
  title?: string;
}

function Line({
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

function InlineLine({
  label,
  widthClass = "w-full",
}: {
  label: string;
  widthClass?: string;
}) {
  return (
    <div className="flex items-end gap-1.5">
      <span className="text-[15px] text-zinc-900">{label}</span>
      <Line widthClass={widthClass} />
    </div>
  );
}

function Box() {
  return <span className="h-4 w-4 border border-zinc-700" />;
}

export default function DailyAirportStatusReport({
  organization = "GRENADA AIRPORTS AUTHORITY",
  subtitle = "Maurice Bishop International Airport",
  location = "St. George's, Grenada, West Indies",
  establishedYear = "Established 1985",
  title = "DAILY AIRPORT STATUS REPORT",
}: DailyAirportStatusReportProps) {
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

      <section className="mb-3 grid grid-cols-2 gap-x-10 gap-y-2">
        <InlineLine label="DEPARTMENT" widthClass="w-28" />
        <InlineLine label="DATE:" widthClass="w-28" />
        <div className="flex items-center gap-8">
          <span className="font-semibold text-[15px] text-zinc-900">
            SHIFT:
          </span>
          <div className="flex items-center gap-2 text-[15px]">
            <span>A.M.</span>
            <Box />
          </div>
          <div className="flex items-center gap-2 text-[15px]">
            <span>P.M.</span>
            <Box />
          </div>
        </div>
        <InlineLine label="ABSENTEEISM" widthClass="w-20" />
      </section>

      <p className="mb-3 text-[15px] text-zinc-900 leading-snug">
        Comments on the Operational Status of the following areas and any other
        which may affect the status or efficiency of the Airport.
      </p>

      <section className="mb-3">
        <h2 className="mb-2 font-bold text-xl text-zinc-900">PERSONNEL:</h2>
        <div className="space-y-2 text-[15px] text-zinc-900">
          <p>a) Have all persons scheduled for the shift reported on time?</p>
          <div className="flex items-center gap-4 pl-5">
            <div className="flex items-center gap-1.5">
              <span>Yes</span>
              <Box />
            </div>
            <div className="flex items-center gap-1.5">
              <span>No</span>
              <Box />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span>b) If No, please explain</span>
            <Line widthClass="w-28" />
          </div>
          <p>
            c) Has this affected the status of efficiency of your operations?
          </p>
          <div className="flex items-center gap-4 pl-5">
            <div className="flex items-center gap-1.5">
              <span>Yes</span>
              <Box />
            </div>
            <div className="flex items-center gap-1.5">
              <span>No</span>
              <Box />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span>d) If Yes, please explain</span>
            <Line widthClass="w-28" />
          </div>
        </div>
      </section>

      <section className="mb-3">
        <h2 className="mb-2 font-bold text-xl text-zinc-900">EQUIPMENT:</h2>
        <div className="space-y-2 text-[15px] text-zinc-900">
          <p>a) Are all equipments under your jurisdiction operational?</p>
          <div className="flex items-center gap-4 pl-5">
            <div className="flex items-center gap-1.5">
              <span>Yes</span>
              <Box />
            </div>
            <div className="flex items-center gap-1.5">
              <span>No</span>
              <Box />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span>b) If No, state reason</span>
            <Line widthClass="w-32" />
          </div>
          <div className="flex items-end gap-2">
            <span>
              c) State what action has been taken to remedy the situation
            </span>
            <Line widthClass="w-32" />
          </div>
        </div>
      </section>

      <section className="mb-4 text-[15px] text-zinc-900">
        <p>
          Have all incidents/accidents report been prepared and submitted to
          Management on each incident/accident
        </p>
        <div className="mt-1 mb-1 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span>Yes</span>
            <Box />
          </div>
          <div className="flex items-center gap-1.5">
            <span>No</span>
            <Box />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <span>If No, why not?</span>
          <Line widthClass="w-32" />
        </div>
      </section>

      <section className="grid grid-cols-[1fr_auto_1fr] items-end gap-x-3 gap-y-2 text-[15px] text-zinc-900">
        <InlineLine label="Supervisor's Signature:" />
        <span>Date:</span>
        <Line />

        <InlineLine label="Manager's Signature:" />
        <span>Date:</span>
        <Line />
      </section>
    </div>
  );
}
