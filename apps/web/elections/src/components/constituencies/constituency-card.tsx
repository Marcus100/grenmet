import type { Route } from "next";
import Link from "next/link";
import { PartyDot, SeatSquare } from "@/components/party-chip";
import type { SeatOutlook } from "@/data/election-2026";
import { leanLabel } from "@/data/model";
import { partyInfo } from "@/data/parties";

/** One constituency at a glance; the whole card links to its page. */
export function ConstituencyCard({ seat }: { seat: SeatOutlook }) {
  return (
    <Link
      className="group bg-background hover:bg-el-paper-2 flex h-full gap-3 p-4"
      href={seat.href as Route}
    >
      <SeatSquare
        className="size-8 shrink-0"
        code={seat.code}
        label={`Held by ${partyInfo(seat.sitting.party).name}`}
        party={seat.sitting.party}
      />
      <span className="min-w-0 flex-1">
        <b className="block font-serif text-lg leading-tight font-bold group-hover:underline">
          {seat.name}
        </b>
        <span className="text-el-ink-2 mt-1 block text-base">
          <PartyDot party={seat.sitting.party} />
          {seat.sitting.name}
          {seat.sitting.was && (
            <span className="text-el-muted"> (elected {seat.sitting.was})</span>
          )}
        </span>
        <span className="text-el-muted mt-1 block text-base tabular-nums">
          2022: {seat.winner2022.party} by {(seat.margin2022 * 100).toFixed(1)}{" "}
          pts
          {seat.lean != null && ` · leans ${leanLabel(seat.lean)}`}
          {` · ${seat.candidates.length} named for 2026`}
        </span>
      </span>
    </Link>
  );
}

/** All 15 constituencies as compact cards. */
export function ConstituencyGrid({ seats }: { seats: SeatOutlook[] }) {
  return (
    <ul className="border-el-rule bg-el-rule grid gap-px border sm:grid-cols-2 lg:grid-cols-3">
      {seats.map((seat) => (
        <li key={seat.code}>
          <ConstituencyCard seat={seat} />
        </li>
      ))}
    </ul>
  );
}
