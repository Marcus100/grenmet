import { FlatMap } from "@/components/map/flat-map";
import { PartyDot } from "@/components/party-chip";
import { currentHouse, type SeatOutlook } from "@/data/election-2026";
import { partyColor, partyInfo } from "@/data/parties";
import type { GeoFile } from "@/data/types";

/** Map of the party holding each seat today; each constituency links to its page. */
export function HouseMap({
  geo,
  seats,
  className,
}: {
  geo: GeoFile;
  seats: SeatOutlook[];
  className?: string;
}) {
  const house = Object.entries(currentHouse(seats)).sort((a, b) => b[1] - a[1]);
  return (
    <figure className={className}>
      <FlatMap
        geo={geo}
        label="Party holding each seat today"
        regions={seats.map((seat) => ({
          code: seat.code,
          fill: partyColor(seat.sitting.party),
          href: seat.href,
          title: `${seat.name}: ${seat.sitting.name}, ${partyInfo(seat.sitting.party).name}`,
        }))}
      />
      <figcaption className="mt-2 text-sm">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {house.map(([party, count]) => (
            <span key={party}>
              <PartyDot party={party} />
              {partyInfo(party).name} <b className="tabular-nums">{count}</b>
            </span>
          ))}
        </span>
        <span className="mt-1 block text-el-muted text-xs">
          Boundaries are illustrative. Carriacou and Petite Martinique are drawn
          closer than they are.
        </span>
      </figcaption>
    </figure>
  );
}
