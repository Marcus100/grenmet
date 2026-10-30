import type { Route } from "next";
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
    <ol className="divide-el-rule border-el-rule divide-y border-y">
      {closest.map((seat) => (
        <li key={seat.code}>
          <Link
            className="hover:bg-el-paper-2 flex items-baseline gap-3 py-3"
            href={seat.href as Route}
          >
            <span className="min-w-0 flex-1">
              <b className="font-serif font-semibold">{seat.name}</b>
              <span className="text-el-muted block text-base">
                <PartyDot party={seat.winner2022.party} />
                {seat.winner2022.name}, {seat.winner2022.party}
                {seat.sitting.party !== seat.winner2022.party &&
                  ` · now ${seat.sitting.party}`}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {(seat.margin2022 * 100).toFixed(1)}
              <small className="text-el-muted ml-0.5 font-normal">pts</small>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
