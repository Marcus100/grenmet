"use client";
import { useState } from "react";
import { pct } from "@/lib/format";
/** Illustrative display arithmetic; never used as an observed election record. */
export function DenominatorLab() {
  const [cast, setCast] = useState(800);
  const [rejected, setRejected] = useState(20);
  const [votes, setVotes] = useState(390);
  const valid = cast - rejected;
  return (
    <div className="max-w-prose space-y-5 bg-el-paper-2 p-6">
      <p className="font-semibold">
        Try it: the same votes, different denominators
      </p>
      <p className="text-sm">
        Illustrative constituency with 1,000 registered electors. Move one value
        and watch the percentages change.
      </p>
      <label className="block text-sm" htmlFor="lab-cast">
        Ballots cast: {cast}
        <input
          className="mt-2 block w-full"
          id="lab-cast"
          max={1000}
          min={0}
          onChange={(event) => {
            const n = Number(event.target.value);
            setCast(n);
            const r = Math.min(rejected, n);
            setRejected(r);
            setVotes(Math.min(votes, n - r));
          }}
          step={10}
          type="range"
          value={cast}
        />
      </label>
      <label className="block text-sm" htmlFor="lab-rejected">
        Rejected ballots: {rejected}
        <input
          className="mt-2 block w-full"
          id="lab-rejected"
          max={cast}
          min={0}
          onChange={(event) => {
            const n = Number(event.target.value);
            setRejected(n);
            setVotes(Math.min(votes, cast - n));
          }}
          type="range"
          value={rejected}
        />
      </label>
      <label className="block text-sm" htmlFor="lab-votes">
        Votes for one candidate: {votes}
        <input
          className="mt-2 block w-full"
          id="lab-votes"
          max={valid}
          min={0}
          onChange={(event) => setVotes(Number(event.target.value))}
          type="range"
          value={votes}
        />
      </label>
      <dl aria-live="polite" className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm">Turnout</dt>
          <dd className="font-bold text-xl">{pct(cast / 1000)}</dd>
          <dd className="text-xs">{cast} ÷ 1,000 registered</dd>
        </div>
        <div>
          <dt className="text-sm">Candidate’s valid-vote share</dt>
          <dd className="font-bold text-xl">
            {valid ? pct(votes / valid) : "Undefined"}
          </dd>
          <dd className="text-xs">
            {votes} ÷ {valid} valid votes
          </dd>
        </div>
        <div>
          <dt className="text-sm">Share of registered electors</dt>
          <dd className="font-bold text-xl">{pct(votes / 1000)}</dd>
          <dd className="text-xs">{votes} ÷ 1,000 registered</dd>
        </div>
      </dl>
      <p className="text-sm">
        When there are no valid votes, valid-vote share is undefined—not zero.
        Changing the denominator changes what a percentage means.
      </p>
      <button
        className="rounded-md border border-el-ink px-4 py-2 text-sm"
        onClick={() => {
          setCast(800);
          setRejected(20);
          setVotes(390);
        }}
        type="button"
      >
        Reset example
      </button>
    </div>
  );
}
