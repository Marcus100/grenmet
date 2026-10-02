import type { Metadata } from "next";
import Link from "next/link";
import {
  type PredictionSeat,
  PredictionTool,
} from "@/components/make-your-map/prediction-tool";
import { ringPath } from "@/components/map/flat-map";
import { PageHead } from "@/components/section";
import { seatOutlook } from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";
import {
  constituencyShortName,
  contestStats,
  generalResult,
  leanLabel,
  MAPPED_YEARS,
} from "@/data/model";
import { leanTable, modelInputs, seatChances, spreads } from "@/data/outlook";
import { ratingFromChances } from "@/data/ratings";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Make your map",
  description:
    "Predict Grenada’s 2026 election: rate all 15 constituencies from Solid NDC to Solid NNP, with the DPM where it stands, and share your map.",
};

export default function YourPredictionPage() {
  const sp = spreads(results, null);
  const lean = leanTable(results, "2022");
  const dpb = campaign.polls.find((p) => p.id === "dpb26") as unknown as {
    bases: { NDC: [number, number]; NNP: [number, number] };
  };
  const inputs = modelInputs(results, dpb.bases);
  const dpmSlate = campaign.candidates.DPM ?? {};
  const chances = seatChances(lean, sp.sL, inputs.defaults, dpmSlate);

  const seats: PredictionSeat[] = seatOutlook(results, campaign).map((s) => ({
    code: s.code,
    name: s.name,
    short: constituencyShortName(results, s.code),
    href: s.href,
    d: ringPath(geo.constituencies[s.code].rings),
    dpmStands: Boolean(dpmSlate[s.code]),
    leanLabel: s.lean == null ? "–" : leanLabel(s.lean),
    model: ratingFromChances(chances[s.code]),
    result2022: `${s.winner2022.party} by ${(s.margin2022 * 100).toFixed(1)} pts`,
    sitting: `${s.sitting.name} (${s.sitting.party}${s.sitting.was ? `, elected ${s.sitting.was}` : ""})`,
    history: Object.fromEntries(
      MAPPED_YEARS.filter((y) => y >= 1990).flatMap((y) => {
        const contest = generalResult(results, String(y), s.code);
        if (!contest?.c[0]) return [];
        const st = contestStats(contest);
        return [[String(y), { winner: st.winner[1], margin: st.margin }]];
      })
    ),
    candidates: s.candidates,
    notes: s.notes,
  }));

  return (
    <>
      <PageHead
        deck={
          <>
            Rate each of the 15 constituencies, from Solid NDC to Solid NNP, and
            for the DPM in the {Object.keys(dpmSlate).length} where it has named
            a candidate. Your map starts from the 2022 result, or any election
            since 1990; change any constituency you disagree with, then share
            the link. Our own ratings are on the{" "}
            <Link className="underline underline-offset-4" href="/forecast">
              Forecast
            </Link>{" "}
            page. This is your prediction, not ours.
          </>
        }
        eyebrow={`General election 2026 · Candidates as of ${formatIsoDate(campaign.updated)}`}
        title="Make your map"
      />
      <div className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6">
        <PredictionTool
          inset={geo.inset}
          land={ringPath(geo.land)}
          seats={seats}
        />
        <p className="mt-6 max-w-[70ch] text-el-muted text-xs">
          Starting from an election, a seat won by 15 points or more is Solid,
          by at least 5 but less than 15 Likely, and by less than 5 Lean; seats
          won by parties not standing in 2026 start as Toss-up. Nothing you
          choose is stored by us: your map lives only in its link.
        </p>
      </div>
    </>
  );
}
