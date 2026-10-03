import { Flag } from "@/components/flag";
import { partyColor, partyInfo } from "@/data/parties";
import type { CandidateRow } from "@/data/types";
import { fmt, pct } from "@/lib/format";

/**
 * Candidates (or Yes/No) with share of valid votes, raw votes and a bar.
 * Each row carries its own verification mark.
 */
export function CandidateTable({
  rows,
  caption,
  winnerLabel = "elected",
}: {
  rows: CandidateRow[];
  caption: string;
  winnerLabel?: string;
}) {
  const valid = rows.reduce((a, r) => a + r[2], 0) || 1;
  const referendum = rows.some((r) => r[1] === "YES");
  return (
    <table className="w-full text-base">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((row, i) => (
          <tr
            className="border-el-rule border-b last:border-b-0"
            key={`${row[0]}${row[1]}`}
          >
            <th className="py-2 pr-3 text-left font-normal" scope="row">
              <span className={i === 0 ? "font-semibold" : ""}>{row[0]}</span>
              <span className="block text-base text-el-muted">
                {referendum ? "" : partyInfo(row[1]).name}
                {i === 0 && (referendum ? "Ahead" : ` · ${winnerLabel}`)}
              </span>
              <span className="mt-1 block h-1.5 bg-el-paper-2">
                <span
                  className="block h-full"
                  style={{
                    width: `${(row[2] / valid) * 100}%`,
                    background: partyColor(row[1]),
                  }}
                />
              </span>
            </th>
            <td className="py-2 text-right tabular-nums">
              <b>{pct(row[2] / valid)}</b>
              <span className="block text-base text-el-muted">
                {fmt(row[2])}
                <Flag status={row[3]} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
