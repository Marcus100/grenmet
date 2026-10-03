import Link from "next/link";
import { PartyDot } from "@/components/party-chip";
import type { SeatOutlook } from "@/data/election-2026";

/** The constituencies won by the smallest margins in 2022, closest first. */
export function ClosestContests({
  seats,
  count = 5,
}: {
  seats: SeatOutlook[];
  count?: number;
}) {
  const closest = [...seats]
    .sort((a, b) => a.margin2022 - b.margin2022)
    .slice(0, count);
  return (
    <ol className="divide-y divide-el-rule border-el-rule border-y">
      {closest.map((seat) => (
        <li key={seat.code}>
          <Link
            className="flex items-baseline gap-3 py-3 hover:bg-el-paper-2"
            href={seat.href}
          >
            <span className="min-w-0 flex-1">
              <b className="font-semibold font-serif">{seat.name}</b>
              <span className="block text-base text-el-muted">
                <PartyDot party={seat.winner2022.party} />
                {seat.winner2022.name}, {seat.winner2022.party}
                {seat.sitting.party !== seat.winner2022.party &&
                  ` · now ${seat.sitting.party}`}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {(seat.margin2022 * 100).toFixed(1)}
              <small className="ml-0.5 font-normal text-el-muted">pts</small>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
