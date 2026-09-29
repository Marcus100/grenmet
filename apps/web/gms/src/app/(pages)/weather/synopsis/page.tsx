import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Weather synopsis",
  description:
    "The duty forecaster's plain-language summary of the pattern over Grenada.",
};

export default function SynopsisPage() {
  return (
    <>
      <PageHeader
        description="The forecaster's plain-language summary."
        title="Weather synopsis"
      />
      <PlaceholderNotice product="The weather synopsis" />
      <PageSection heading="Current situation">
        <Prose
          paragraphs={[
            "A weak tropical wave is moving west across the Windward Islands and is expected to pass over Grenada overnight, bringing a period of showers and isolated thunderstorms.",
            "A ridge of high pressure to the north maintains a moderate east-north-easterly flow across the area, with speeds of 12 to 18 knots and higher gusts near showers.",
            "Behind the wave, drier and more stable air is expected to return by midweek, easing shower activity across the tri-island state.",
          ]}
        />
      </PageSection>
      <PageSection heading="What to watch">
        <Prose
          paragraphs={[
            "Brief heavy bursts within the wave may cause ponding on roads in low-lying parts of St. George's and along the western coastal road.",
            "Seas remain moderate. No marine advisory is anticipated at this time.",
          ]}
        />
      </PageSection>
    </>
  );
}
