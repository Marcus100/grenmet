import Link from "next/link";
import { PartyDot, SeatSquare } from "@/components/party-chip";
import { currentHouse, type SeatOutlook } from "@/data/election-2026";
import { MAJORITY, SEATS } from "@/data/model";
import { partyInfo } from "@/data/parties";

/**
 * The House as it stood at dissolution: 15 squares grouped by the party that
 * held each seat, with a tick after the eighth for a majority. Each square
 * links to its constituency, and a key names every letter.
 */
export function HouseStrip({ seats }: { seats: SeatOutlook[] }) {
  const house = currentHouse(seats);
  const order = Object.entries(house).sort((a, b) => b[1] - a[1]);
  const rank = Object.fromEntries(order.map(([party], i) => [party, i]));
  const sorted = [...seats].sort(
    (a, b) =>
      (rank[a.sitting.party] ?? 0) - (rank[b.sitting.party] ?? 0) ||
      a.code.localeCompare(b.code)
  );

  return (
    <figure className="m-0">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
        <span>The House at dissolution · {SEATS} seats</span>
        <span className="whitespace-nowrap">{MAJORITY} for a majority</span>
      </figcaption>
      <div className="relative grid grid-cols-15 gap-[3px]">
        {sorted.map((seat) => (
          <Link
            className="rounded-[2px] focus-visible:outline-2 focus-visible:outline-el-focus focus-visible:outline-offset-1"
            href={seat.href}
            key={seat.code}
          >
            <SeatSquare
              code={seat.code}
              label={`${seat.name}: ${seat.sitting.name}, ${partyInfo(seat.sitting.party).name}`}
              party={seat.sitting.party}
            />
          </Link>
        ))}
        <span
          aria-hidden="true"
          className="absolute -inset-y-1.5 w-0.5 bg-el-ink"
          style={{ left: `calc(${(MAJORITY / SEATS) * 100}% - 2px)` }}
        />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base leading-relaxed">
        {order.map(([party, count]) => (
          <span key={party}>
            <PartyDot party={party} />
            <b className="font-semibold">{party}</b>{" "}
            <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </p>
      <details className="mt-2 text-base">
        <summary className="cursor-pointer font-semibold text-el-ink-2 hover:text-el-ink">
          Which constituency is each letter?
        </summary>
        <ul className="mt-2 space-y-2">
          {order.map(([party]) => (
            <li key={party}>
              <PartyDot party={party} />
              <b className="font-semibold">{partyInfo(party).name}</b>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 pl-4 sm:grid-cols-2">
                {sorted
                  .filter((seat) => seat.sitting.party === party)
                  .map((seat) => (
                    <li key={seat.code}>
                      <span className="inline-block w-5 font-bold tabular-nums">
                        {seat.code}
                      </span>
                      <Link className="hover:underline" href={seat.href}>
                        {seat.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
