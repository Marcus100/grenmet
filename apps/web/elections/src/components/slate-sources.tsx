import { SourceLink } from "@/components/source-link";
import { slateSources } from "@/data/election-2026";
import type { CampaignFile } from "@/data/types";

/** Every source behind a party's named candidates, comma-separated. */
export function SlateSources({
  campaign,
  party,
}: {
  campaign: CampaignFile;
  party: string;
}) {
  const ids = slateSources(campaign, party);
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <SourceLink id={id} sources={campaign.sources} />
        </span>
      ))}
    </>
  );
}
