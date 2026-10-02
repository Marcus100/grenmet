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
import { constituencyShortName, leanLabel } from "@/data/model";
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
    won2022: s.winner2022.party === "NDC" ? "NDC" : "NNP",
    candidates: s.candidates,
  }));

  return (
    <>
      <PageHead
        deck={
          <>
            Rate each of the 15 constituencies, from Solid NDC to Solid NNP, and
            for the DPM in the {Object.keys(dpmSlate).length} where it has named
            a candidate. Your map starts from our{" "}
            <Link className="underline underline-offset-4" href="/forecast">
              model’s ratings
            </Link>
            ; change any you disagree with, then share the link. This is your
            prediction, not ours.
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
          Solid, Likely and Lean follow the model’s bands (95%+, 80–95%, 60–80%
          chance); Toss-up is under 60% for the leader. Nothing you choose is
          stored by us: your map lives only in its link.
        </p>
      </div>
    </>
  );
}
