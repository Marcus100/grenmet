import { type EventDivision, sideLabel } from "@/data/events";
import { fmt, pct } from "@/lib/format";

/** Every polling station, grouped by division, behind a disclosure. */
export function StationTable({
  divisions,
  ballots,
}: {
  divisions: EventDivision[];
  ballots?: boolean;
}) {
  if (!divisions.length) return null;
  const parties = [...new Set(divisions.flatMap((d) => d.c.map((r) => r[1])))];
  const label = sideLabel;
  const stations = divisions.flatMap((d) => d.stations.map((s) => ({ d, s })));
  return (
    <details className="mt-3 border-el-rule border-t pt-2">
      <summary className="cursor-pointer font-semibold text-sm">
        {divisions.length} polling divisions · {stations.length} stations
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-el-ink border-b text-left">
              <th className="py-1.5 pr-2 font-semibold" scope="col">
                Station
              </th>
              <th className="py-1.5 pr-2 font-semibold" scope="col">
                Location
              </th>
              <th className="py-1.5 pr-2 text-right font-semibold" scope="col">
                Registered
              </th>
              <th className="py-1.5 pr-2 text-right font-semibold" scope="col">
                {ballots ? "Voters" : "Ballots"}
              </th>
              <th className="py-1.5 pr-2 text-right font-semibold" scope="col">
                Turnout
              </th>
              {parties.map((p) => (
                <th
                  className="py-1.5 pr-2 text-right font-semibold"
                  key={p}
                  scope="col"
                >
                  {label(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stations.map(({ d, s }) => {
              const top = Object.entries(s.votes).sort(
                (a, b) => b[1] - a[1]
              )[0]?.[0];
              return (
                <tr
                  className="border-el-rule border-b"
                  key={`${d.division}${s.sub ?? ""}${s.place}`}
                >
                  <td className="py-1 pr-2 font-semibold">
                    {d.division}
                    {s.sub ? ` (${s.sub})` : ""}
                  </td>
                  <td className="py-1 pr-2">{s.place}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmt(s.reg)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmt(s.cast)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {s.reg && s.cast != null ? pct(s.cast / s.reg, 0) : "–"}
                  </td>
                  {parties.map((p) => (
                    <td
                      className={`py-1 pr-2 text-right tabular-nums ${p === top ? "font-bold" : ""}`}
                      key={p}
                    >
                      {fmt(s.votes[p] ?? 0)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
