export interface InfoTableProps {
  caption?: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

/** Bordered data table. Scrolls on its own so narrow screens never pan. */
export function InfoTable({ caption, headers, rows }: InfoTableProps) {
  return (
    <div className="overflow-x-auto rounded border border-gm-border">
      <table className="w-full border-collapse text-left">
        {caption && (
          <caption className="border-gm-border border-b bg-gm-surface px-4 py-2.5 text-gm-text-secondary text-label leading-label lg:px-5">
            {caption}
          </caption>
        )}
        <thead className="bg-gm-surface">
          <tr>
            {headers.map((header) => (
              <th
                className="whitespace-nowrap px-4 py-2.5 font-bold text-gm-navy text-label leading-label lg:px-5 lg:py-3"
                key={header}
                scope="col"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-gm-border border-t" key={row.join("|")}>
              {row.map((cell) => (
                <td
                  className="px-4 py-2.5 text-body text-gm-text-secondary leading-body lg:px-5 lg:py-3"
                  key={cell}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
