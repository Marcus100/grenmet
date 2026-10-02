import { PartyDot, SeatSquare } from "@/components/party-chip";
import { currentHouse, type SeatOutlook } from "@/data/election-2026";
import { MAJORITY, SEATS } from "@/data/model";
import { partyInfo } from "@/data/parties";

/**
 * The House as it stands: 15 squares grouped by the party that holds each
 * seat now, with a tick after the eighth for a majority.
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
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-3 font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
        <span>House of Representatives now · {SEATS} seats</span>
        <span>{MAJORITY} for a majority</span>
      </figcaption>
      <div className="relative grid grid-cols-15 gap-[3px]">
        {sorted.map((seat) => (
          <SeatSquare
            code={seat.code}
            key={seat.code}
            label={`${seat.name}: ${seat.sitting.name}, ${partyInfo(seat.sitting.party).name}`}
            party={seat.sitting.party}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute -inset-y-1.5 w-0.5 bg-el-ink"
          style={{ left: `calc(${(MAJORITY / SEATS) * 100}% - 2px)` }}
        />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {order.map(([party, count]) => (
          <span key={party}>
            <PartyDot party={party} />
            <b className="font-semibold">{party}</b>{" "}
            <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </p>
    </figure>
  );
}
