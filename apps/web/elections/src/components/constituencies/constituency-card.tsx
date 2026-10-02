import Link from "next/link";
import { PartyDot, SeatSquare } from "@/components/party-chip";
import type { SeatOutlook } from "@/data/election-2026";
import { leanLabel } from "@/data/model";
import { partyInfo } from "@/data/parties";

/** One constituency at a glance; the whole card links to its page. */
export function ConstituencyCard({ seat }: { seat: SeatOutlook }) {
  return (
    <Link
      className="group flex h-full gap-3 bg-background p-4 hover:bg-el-paper-2"
      href={seat.href}
    >
      <SeatSquare
        className="size-8 shrink-0"
        code={seat.code}
        label={`Held by ${partyInfo(seat.sitting.party).name}`}
        party={seat.sitting.party}
      />
      <span className="min-w-0 flex-1">
        <b className="block font-bold font-serif text-lg leading-tight group-hover:underline">
          {seat.name}
        </b>
        <span className="mt-1 block text-el-ink-2 text-sm">
          <PartyDot party={seat.sitting.party} />
          {seat.sitting.name}
          {seat.sitting.was && (
            <span className="text-el-muted"> (elected {seat.sitting.was})</span>
          )}
        </span>
        <span className="mt-1 block text-el-muted text-xs tabular-nums">
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
    <ul className="grid gap-px border border-el-rule bg-el-rule sm:grid-cols-2 lg:grid-cols-3">
      {seats.map((seat) => (
        <li key={seat.code}>
          <ConstituencyCard seat={seat} />
        </li>
      ))}
    </ul>
  );
}
