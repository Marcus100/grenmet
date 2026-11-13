"use client";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState } from "react";
import type { EvidenceMetric, MetricEvidence } from "@/data/evidence";
import { fmt, pct } from "@/lib/format";
export interface EvidenceComparisonRow {
  evidence: Record<EvidenceMetric, MetricEvidence>;
  href: string;
  id: string;
  seats: number;
  turnout: number | null;
  votes: number;
  year: number;
}
export function EvidenceComparison({
  rows,
}: {
  rows: EvidenceComparisonRow[];
}) {
  const [officialOnly, setOfficialOnly] = useState(false);
  const [metric, setMetric] = useState<EvidenceMetric>("votes");
  const id = useId();
  return (
    <details className="border-el-rule mt-4 border-t pt-4">
      <summary className="cursor-pointer text-base font-semibold">
        Compare national statistics and their evidence
      </summary>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-base">
        <label htmlFor={`${id}-metric`}>
          Measure{" "}
          <select
            className="border-el-rule bg-background ml-2 rounded-md border p-2"
            id={`${id}-metric`}
            onChange={(event) =>
              setMetric(event.target.value as EvidenceMetric)
            }
            value={metric}
          >
            <option value="votes">Valid votes</option>
            <option value="seats">Seats filled</option>
            <option value="turnout">Turnout / proxy</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={officialOnly}
            onChange={(event) => setOfficialOnly(event.target.checked)}
            type="checkbox"
          />
          Official-data-only view
        </label>
      </div>
      <p
        className="text-el-muted mt-3 max-w-prose text-base leading-relaxed"
        role="status"
      >
        {officialOnly
          ? "Unsupported observations are withheld, not replaced with zero. The source must support every input to this measure."
          : "Full history: mixed and secondary sources remain visible and labelled."}{" "}
        This comparison table has its own filter; other charts retain their
        stated coverage.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-base">
          <caption className="sr-only">
            National statistics with calculation evidence
          </caption>
          <thead>
            <tr className="border-el-rule border-b">
              <th className="p-2" scope="col">
                Election
              </th>
              <th className="p-2" scope="col">
                Value
              </th>
              <th className="p-2" scope="col">
                Evidence and method
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const evidence = row.evidence[metric];
              const shown = !officialOnly || evidence.official;
              let value = "Withheld";
              if (shown && metric === "turnout")
                value = row.turnout === null ? "Unavailable" : pct(row.turnout);
              else if (shown && metric !== "turnout") value = fmt(row[metric]);
              return (
                <tr className="border-el-rule border-b align-top" key={row.id}>
                  <th className="p-2 font-normal" scope="row">
                    <Link className="underline" href={row.href as Route}>
                      {row.year}
                    </Link>
                  </th>
                  <td className="p-2 tabular-nums">{value}</td>
                  <td className="p-2">
                    <span className="font-semibold">{evidence.label}</span>
                    <details className="mt-1">
                      <summary className="cursor-pointer">
                        Calculation and source
                      </summary>
                      <p className="mt-2 leading-relaxed">{evidence.formula}</p>
                      <p className="mt-1 leading-relaxed">{evidence.source}</p>
                      <p className="text-el-muted mt-1 leading-relaxed">
                        {evidence.note}
                      </p>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
