"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PartyDot } from "@/components/party-chip";

export interface DirectoryRow {
  best: number;
  codes: string[];
  first: number;
  href: string;
  last: number;
  name: string;
  /** Other spellings, for search. */
  names: string[];
  parties: string[];
  races: number;
  wins: number;
}

type SortKey = "name" | "races" | "wins" | "first" | "best";

interface Sort {
  dir: 1 | -1;
  key: SortKey;
}

function ariaSort(
  sort: Sort,
  key: SortKey
): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.dir === 1 ? "ascending" : "descending";
}

/** Clicking the current column flips it; a new column starts A–Z for names, highest first otherwise. */
function nextDirection(sort: Sort, key: SortKey): 1 | -1 {
  if (sort.key === key) return sort.dir === 1 ? -1 : 1;
  return key === "name" ? 1 : -1;
}

const SELECT =
  "h-9 w-full rounded-md border border-el-rule-2 bg-background px-2 text-sm sm:w-auto sm:max-w-64";

/** Search, filter and sort everyone who has stood since 1951. */
export function CandidateDirectory({
  rows,
  parties,
  constituencies,
}: {
  rows: DirectoryRow[];
  parties: { code: string; name: string }[];
  constituencies: { code: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [party, setParty] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");
  const [sort, setSort] = useState<Sort>({
    key: "wins",
    dir: -1,
  });
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (!needle ||
            [r.name, ...r.names].some((n) =>
              n.toLowerCase().includes(needle)
            )) &&
          (!party || r.parties.includes(party)) &&
          (!code || r.codes.includes(code)) &&
          (!result || (result === "won" ? r.wins > 0 : r.wins === 0))
      )
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        if (va === vb) return b.races - a.races;
        return (va > vb ? 1 : -1) * sort.dir;
      });
  }, [rows, q, party, code, result, sort]);

  const header = (key: SortKey, label: string, right = false) => (
    <th
      aria-sort={ariaSort(sort, key)}
      className={`py-2 pr-3 font-semibold ${right ? "text-right" : ""}`}
      scope="col"
    >
      <button
        className="hover:underline"
        onClick={() => setSort((s) => ({ key, dir: nextDirection(s, key) }))}
        type="button"
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? " ↑" : " ↓")}
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
          Name
          <input
            className={`${SELECT} sm:w-56`}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(60);
            }}
            placeholder="Search a name"
            type="search"
            value={q}
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
          Party
          <select
            className={SELECT}
            onChange={(e) => setParty(e.target.value)}
            value={party}
          >
            <option value="">Any party</option>
            {parties.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
          Constituency
          <select
            className={SELECT}
            onChange={(e) => setCode(e.target.value)}
            value={code}
          >
            <option value="">Any (1972 on)</option>
            {constituencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
          Result
          <select
            className={SELECT}
            onChange={(e) => setResult(e.target.value)}
            value={result}
          >
            <option value="">Everyone</option>
            <option value="won">Won at least once</option>
            <option value="never">Never won</option>
          </select>
        </label>
        <p aria-live="polite" className="pb-2 text-el-muted text-sm">
          {filtered.length} people
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-el-ink border-b text-left">
              {header("name", "Name")}
              <th className="py-2 pr-3 font-semibold" scope="col">
                Party
              </th>
              {header("races", "Races", true)}
              {header("wins", "Wins", true)}
              {header("first", "Years")}
              {header("best", "Best share", true)}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr className="border-el-rule border-b" key={r.href}>
                <td className="py-2 pr-3">
                  <Link className="font-semibold hover:underline" href={r.href}>
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  {r.parties.map((p) => (
                    <span className="mr-2 whitespace-nowrap" key={p}>
                      <PartyDot party={p} />
                      {p}
                    </span>
                  ))}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.races}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.wins}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {r.first === r.last ? r.first : `${r.first}–${r.last}`}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {(r.best * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button
          className="mt-3 rounded-md border border-el-rule-2 px-3 py-1.5 text-sm hover:bg-el-paper-2"
          onClick={() => setLimit((l) => l + 120)}
          type="button"
        >
          Show more ({filtered.length - limit} left)
        </button>
      )}
    </div>
  );
}
