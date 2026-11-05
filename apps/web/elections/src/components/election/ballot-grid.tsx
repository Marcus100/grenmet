import type { Route } from "next";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { PartyDot } from "@/components/party-chip";
import type { SeatOutlook } from "@/data/election-2026";

const SLATES = ["NDC", "NNP", "DPM"] as const;

function Slot({
  seat,
  party,
}: {
  seat: SeatOutlook;
  party: (typeof SLATES)[number];
}) {
  const named = seat.candidates.find((c) => c.party === party);
  const note = seat.notes[party];
  if (named)
    return (
      <>
        {named.name}
        {note && <Flag note={note} status="unverified" />}
      </>
    );
  // Where no NDC candidate is named, show the sitting member explicitly
  // as an MP rather than implying a confirmed candidacy.
  if (party === "NDC" && seat.sitting.party === "NDC")
    return (
      <span className="text-el-ink-2">
        {seat.sitting.name}{" "}
        <span className="text-el-muted text-base">(MP, not confirmed)</span>
      </span>
    );
  if (party === "DPM") return null;
  return (
    <span className="text-el-muted">
      Not named yet
      {note && <Flag note={note} status="unverified" />}
    </span>
  );
}

/** Who is standing in each constituency, as small cards rather than a wide table. */
export function BallotGrid({ seats }: { seats: SeatOutlook[] }) {
  return (
    <ul className="border-el-rule bg-el-rule grid gap-px border sm:grid-cols-2 lg:grid-cols-3">
      {seats.map((seat) => (
        <li className="bg-background p-4" key={seat.code}>
          <Link
            className="font-serif text-lg leading-tight font-bold hover:underline"
            href={seat.href as Route}
          >
            {seat.name}
          </Link>
          <ul className="mt-2 space-y-1 text-base">
            {SLATES.map((party) => {
              const slot = <Slot party={party} seat={seat} />;
              if (
                party === "DPM" &&
                !seat.candidates.some((c) => c.party === "DPM")
              )
                return null;
              return (
                <li className="flex gap-2" key={party}>
                  <span className="text-el-muted w-12 shrink-0 font-semibold">
                    <PartyDot party={party} />
                    {party}
                  </span>
                  <span className="min-w-0">{slot}</span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
