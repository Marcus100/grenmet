import Link from "next/link";
import { Flag } from "@/components/flag";
import { PartyDot } from "@/components/party-chip";
import { SourceLink } from "@/components/source-link";
import {
  candidateNote,
  currentHouse,
  PARTY_NOTES,
  type SeatOutlook,
} from "@/data/election-2026";
import type { NationalResult } from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import type { CampaignFile } from "@/data/types";
import { pct } from "@/lib/format";

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";

/** Three parties tracked here: House at dissolution, 2022 result, recorded names. */
export function RaceInBrief({
  seats,
  result2022,
  campaign,
}: {
  seats: SeatOutlook[];
  result2022: NationalResult;
  campaign: CampaignFile;
}) {
  const house = currentHouse(seats);
  return (
    <div>
      <ul className="border-el-rule bg-el-rule grid gap-px border md:grid-cols-3">
        {(["NDC", "NNP", "DPM"] as const).map((party) => {
          const note = PARTY_NOTES[party];
          const named = Object.keys(campaign.candidates[party] ?? {}).length;
          const won = result2022.seats[party];
          const votes = result2022.votes[party];
          const uncertain = seats.filter(
            (seat) =>
              seat.candidates.some((candidate) => candidate.party === party) &&
              candidateNote(campaign, party, seat.code)
          ).length;
          return (
            <li className="bg-background p-4" key={party}>
              <span
                className="block h-1 w-10"
                style={{ background: partyColor(party) }}
              />
              <h3 className="mt-2 text-lg leading-tight font-bold">
                <PartyDot party={party} />
                {partyInfo(party).name}
              </h3>
              <p className="text-el-ink-2 mt-1 text-base leading-relaxed">
                {note.text}
                {note.unverified && (
                  <Flag note={note.unverified} status="unverified" />
                )}
              </p>
              <p className="text-el-muted mt-1 text-base leading-relaxed">
                <SourceLink id={note.source} sources={campaign.sources} />
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <dt className={LABEL}>At dissolution</dt>
                  <dd
                    className="text-xl font-semibold tabular-nums"
                    style={{ color: partyColor(party, "ink") }}
                  >
                    {house[party] ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>2022</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {won == null ? "–" : won}
                  </dd>
                  <dd className="text-el-muted text-base">
                    {votes
                      ? `${pct(votes / result2022.total)} of votes`
                      : "did not stand"}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>Earlier names</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {named ? `${named}` : "–"}
                    {uncertain > 0 && (
                      <Flag
                        note={`${uncertain} named candidates still need public or primary-source confirmation; see Candidates for individual notes.`}
                        status="unverified"
                      />
                    )}
                  </dd>
                  <dd className="text-el-muted text-base">
                    {named
                      ? "in our incomplete directory"
                      : "none recorded here"}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="text-el-muted mt-3 text-base">
        Names recorded through{" "}
        {campaign.candidate_names_as_of ?? campaign.updated}. See{" "}
        <Link className="underline" href="/candidates">
          latest nomination coverage
        </Link>
        .
      </p>
    </div>
  );
}
