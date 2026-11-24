import type { Route } from "next";
import Link from "next/link";
import { PartyDot, SeatSquare } from "@/components/party-chip";
import {
  type DeclaredResult,
  type DeclaredSeat,
  PEO_RESULTS_LABEL,
  PEO_RESULTS_URL,
} from "@/data/election-2026";
import { SEATS } from "@/data/model";
import { partyInfo } from "@/data/parties";
import { fmt, pct } from "@/lib/format";

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";

/** "by 164 votes": a margin with its unit. */
export function votesMargin(majority: number): string {
  return `by ${fmt(majority)} ${majority === 1 ? "vote" : "votes"}`;
}

/** "14 of 15 seats". */
export function seatsOfHouse(count: number): string {
  return `${count} of ${SEATS} ${count === 1 ? "seat" : "seats"}`;
}

/** The standing line under every declared figure: provisional, who says so, and where. */
export function ProvisionalSource({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-el-muted text-base leading-relaxed"}>
      {PEO_RESULTS_LABEL}. All data is provisional until officially certified.{" "}
      <a
        className="underline underline-offset-4"
        href={PEO_RESULTS_URL}
        rel="noopener"
      >
        Source: Parliamentary Elections Office results
      </a>
      .
    </p>
  );
}

/** Seats per party out of 15, turnout and the source line. */
export function DeclaredSummary({ result }: { result: DeclaredResult }) {
  const winner = result.winningParty;
  return (
    <section aria-label="Provisional result">
      <p className={LABEL}>Provisional result</p>
      <p className="mt-1 font-serif text-2xl leading-tight font-bold">
        {winner
          ? `${partyInfo(winner).name} wins ${seatsOfHouse(result.seats[0]?.[1] ?? 0)}`
          : "No party has a majority"}
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-lg">
        {result.seats.map(([party, count]) => (
          <li key={party}>
            <PartyDot party={party} />
            <b className="font-semibold">{party}</b>{" "}
            <span className="tabular-nums">
              {count} of {SEATS}
            </span>
          </li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="mt-3 grid max-w-md grid-cols-15 gap-[3px]"
      >
        {[...result.seatRows]
          .sort(
            (a, b) =>
              result.seats.findIndex(([p]) => p === a.winner.party) -
                result.seats.findIndex(([p]) => p === b.winner.party) ||
              a.code.localeCompare(b.code)
          )
          .map((seat) => (
            <SeatSquare
              code={seat.code}
              key={seat.code}
              label={`${seat.name}: ${seat.winner.name}, ${seat.winner.party}`}
              party={seat.winner.party}
            />
          ))}
      </div>
      <dl className="border-el-rule mt-4 grid max-w-md grid-cols-2 gap-3 border-t pt-3">
        <div>
          <dt className={LABEL}>Turnout</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {pct(result.turnout)}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Registered voters</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {fmt(result.registered)}
          </dd>
        </div>
      </dl>
      <ProvisionalSource className="text-el-muted mt-3 text-base leading-relaxed" />
    </section>
  );
}

/** One row per constituency: winner, party, votes, share and margin. */
export function DeclaredTable({ seats }: { seats: DeclaredSeat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-base">
        <caption className="sr-only">
          Provisional 2026 winner in each constituency
        </caption>
        <thead>
          <tr className="border-el-ink border-b-2 text-left">
            <th className={`${LABEL} py-2 pr-3`} scope="col">
              Constituency
            </th>
            <th className={`${LABEL} py-2 pr-3`} scope="col">
              Winner
            </th>
            <th className={`${LABEL} py-2 pr-3 text-right`} scope="col">
              Votes
            </th>
            <th className={`${LABEL} py-2 text-right`} scope="col">
              Margin
            </th>
          </tr>
        </thead>
        <tbody>
          {seats.map((seat) => (
            <tr className="border-el-rule border-b" key={seat.code}>
              <th className="py-2 pr-3 text-left font-normal" scope="row">
                <Link
                  className="font-serif font-semibold hover:underline"
                  href={seat.href as Route}
                >
                  {seat.name}
                </Link>
              </th>
              <td className="py-2 pr-3">
                <PartyDot party={seat.winner.party} />
                {seat.winner.name}, {seat.winner.party}
                {seat.was.party !== seat.winner.party && (
                  <span className="text-el-muted block text-base">
                    Held by {seat.was.party} at dissolution
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {fmt(seat.winner.votes)}
                <span className="text-el-muted block text-base">
                  {pct(seat.share)}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">
                {votesMargin(seat.majority)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Beside the map: the four closest contests and the seats that changed party. */
export function DeclaredWatch({ result }: { result: DeclaredResult }) {
  const flipped = result.seatRows.filter(
    (row) => row.was.party !== row.winner.party
  );
  const closest = [...result.seatRows]
    .sort((a, b) => a.majority - b.majority)
    .slice(0, 4);
  return (
    <>
      <div>
        <h3 className={LABEL}>Closest in 2026 · winning margin</h3>
        <ol className="divide-el-rule border-el-rule mt-2 divide-y border-y">
          {closest.map((row) => (
            <li key={row.code}>
              <Link
                className="hover:bg-el-paper-2 flex items-baseline gap-3 py-3"
                href={row.href as Route}
              >
                <span className="min-w-0 flex-1">
                  <b className="font-serif font-semibold">{row.name}</b>
                  <span className="text-el-muted block text-base">
                    <PartyDot party={row.winner.party} />
                    {row.winner.name}, {row.winner.party}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {votesMargin(row.majority)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className={LABEL}>Changed hands in 2026</h3>
        {flipped.length > 0 ? (
          <ul className="divide-el-rule border-el-rule mt-2 divide-y border-y text-base">
            {flipped.map((row) => (
              <li className="py-2.5" key={row.code}>
                <Link
                  className="font-serif font-semibold hover:underline"
                  href={row.href as Route}
                >
                  {row.name}
                </Link>
                <span className="text-el-muted block text-base">
                  <PartyDot party={row.winner.party} />
                  {row.winner.name} won it for {row.winner.party};{" "}
                  {row.was.party} held it at dissolution
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-el-ink-2 mt-2 text-base">No seat changed party.</p>
        )}
      </div>
    </>
  );
}
