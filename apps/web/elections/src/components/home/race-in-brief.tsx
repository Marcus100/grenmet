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

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

/** One card per party standing in 2026: seats now, 2022 result, candidates named. */
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
    <ul className="grid gap-px border border-el-rule bg-el-rule md:grid-cols-3">
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
            <h3 className="mt-2 font-bold text-lg leading-tight">
              <PartyDot party={party} />
              {partyInfo(party).name}
            </h3>
            <p className="mt-1 text-el-ink-2 text-sm">
              {note.text}
              {note.unverified && (
                <Flag note={note.unverified} status="unverified" />
              )}
            </p>
            <p className="mt-1 text-el-muted text-xs">
              <SourceLink id={note.source} sources={campaign.sources} />
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <dt className={LABEL}>Seats now</dt>
                <dd
                  className="font-semibold text-xl tabular-nums"
                  style={{ color: partyColor(party, "ink") }}
                >
                  {house[party] ?? 0}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>2022</dt>
                <dd className="font-semibold text-xl tabular-nums">
                  {won == null ? "–" : won}
                </dd>
                <dd className="text-el-muted text-xs">
                  {votes
                    ? `${pct(votes / result2022.total)} of votes`
                    : "did not stand"}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Named for 2026</dt>
                <dd className="font-semibold text-xl tabular-nums">
                  {named ? `${named}` : "–"}
                  {uncertain > 0 && (
                    <Flag
                      note={`${uncertain} named candidates still need public or primary-source confirmation; see Candidates for individual notes.`}
                      status="unverified"
                    />
                  )}
                </dd>
                <dd className="text-el-muted text-xs">
                  {named ? "of 15 seats" : "no slate yet"}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
