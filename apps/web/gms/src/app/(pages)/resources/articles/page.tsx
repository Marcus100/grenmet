import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Articles",
  description:
    "Explainers on Grenada's weather and climate from the Grenada Meteorological Service.",
};

export default function ArticlesPage() {
  return (
    <>
      <PageHeader
        description="Explainers on Grenada's weather and climate."
        title="Articles"
      />
      <PlaceholderNotice product="The article listing on this page" />
      <PageSection heading="Can a hurricane hit Grenada?">
        <Prose
          paragraphs={[
            "Grenada sits at roughly 12°N, near the southern edge of the Atlantic hurricane belt. Most Atlantic systems track further north, which is why the island is struck less often than the northern Windward and Leeward Islands.",
            "Less often is not rarely, and it is certainly not never. Janet in 1955, Ivan in 2004 and Beryl in 2024 are the correction to any belief that Grenada is outside the risk. A long quiet run tells you nothing about the coming season.",
          ]}
        />
      </PageSection>
      <PageSection heading="Why the two coasts have different weather">
        <Prose
          paragraphs={[
            "Grenada's mountainous interior forces the prevailing north-easterly trades upward as they reach the island. Air rising over the windward side cools, condenses and rains — which is why Grand Etang is far wetter than the coast.",
            "By the time that air descends on the leeward western side it has lost much of its moisture and is warming again, suppressing cloud. The result is a rain shadow: two places a few kilometres apart with genuinely different climates.",
          ]}
        />
      </PageSection>
      <PageSection heading="What a tropical wave actually is">
        <Prose
          paragraphs={[
            "A tropical wave is a westward-moving trough in the trade wind flow, often originating over Africa. Most never become anything more, but they carry the convergence and moisture that produce the showery spells making up much of Grenada's rainfall.",
            "A handful each season organise further and become depressions, storms and hurricanes. The rest simply pass over, deliver a wet day or two, and move on.",
          ]}
        />
      </PageSection>
    </>
  );
}
