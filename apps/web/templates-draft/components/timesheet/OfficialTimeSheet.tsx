interface OfficialTimeSheetProps {
  organization?: string;
  airportLineOne?: string;
  airportLineTwo?: string;
  title?: string;
  rowCount?: number;
}

const columns = [
  "DATE",
  "NAME",
  "ROSTER HOURS",
  "ACTUAL HOURS",
  "TOTAL HOURS",
  "BREAK HOURS",
  "HOURS WORKED",
  "REMARKS",
];

function BlankRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <tr key={idx}>
          {columns.map((col) => (
            <td key={`${idx}-${col}`} className="h-6 border border-zinc-900" />
          ))}
        </tr>
      ))}
    </>
  );
}

export default function OfficialTimeSheet({
  organization = "GRENADA AIRPORTS AUTHORITY",
  airportLineOne = "MAURICE BISHOP INTERNATIONAL AIRPORT",
  airportLineTwo = "& LAURISTON AIRPORT",
  title = "OFFICIAL TIME SHEET",
  rowCount = 18,
}: OfficialTimeSheetProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      <header className="mb-8 text-center">
        <div className="text-2xl font-semibold text-zinc-900">{organization}</div>
        <div className="text-xl font-semibold text-zinc-900">{airportLineOne}</div>
        <div className="text-xl font-semibold text-zinc-900">{airportLineTwo}</div>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{title}</h1>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-8">
        <div className="flex items-end gap-2">
          <span className="text-2xl font-semibold text-zinc-900">DEPARTMENT:</span>
          <span className="h-7 w-24 border-b border-zinc-900" />
        </div>
        <div className="flex items-end justify-end gap-2">
          <span className="text-2xl font-semibold text-zinc-900">PERIOD:</span>
          <span className="h-7 w-28 border-b border-zinc-900" />
        </div>
      </section>

      <section className="mb-6">
        <table className="w-full table-fixed border-collapse text-center text-lg text-zinc-900">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="border border-zinc-900 px-1 py-1 font-semibold leading-tight"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <BlankRows count={rowCount} />
          </tbody>
        </table>
      </section>

      <section className="mb-6 flex justify-center">
        <div className="w-[62%] text-center text-[27px] text-zinc-900">
          <div className="mb-1 border-b border-zinc-900" />
          <span>Department Manager/Supervisor</span>
        </div>
      </section>

      <section className="space-y-1 text-[27px] leading-tight text-zinc-900">
        <p>
          (a) To be completed each shift per day and{" "}
          <span className="underline">submitted weekly to the Human Resource Department</span>
        </p>
        <p>(b) All Staff Movement must be accounted for .</p>
        <p>(c) Brief explanation to be provided in Remark Column</p>
        <p>(d) Medical Certificates to be attached where necessary.</p>
      </section>
    </div>
  );
}
