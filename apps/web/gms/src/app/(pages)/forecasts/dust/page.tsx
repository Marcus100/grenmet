import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Saharan dust and haze",
  description:
    "Five-day Saharan dust outlook for Grenada, with visibility and air-quality guidance.",
};

export default function DustPage() {
  return (
    <>
      <PageHeader
        description="Five-day Saharan dust outlook for the tri-island state."
        title="Saharan dust and haze"
      />
      <PlaceholderNotice product="The dust outlook" />
      <PageSection heading="Five-day outlook">
        <InfoTable
          headers={["Day", "Concentration", "Visibility", "Guidance"]}
          rows={[
            ["Today", "Light", "Good — over 10 km", "No action needed"],
            [
              "Tomorrow",
              "Moderate",
              "Reduced — 7 to 10 km",
              "Sensitive groups take care",
            ],
            [
              "Day 3",
              "Moderate to heavy",
              "Hazy — 4 to 7 km",
              "Limit strenuous outdoor activity",
            ],
            [
              "Day 4",
              "Heavy",
              "Poor — under 4 km",
              "Sensitive groups stay indoors where possible",
            ],
            [
              "Day 5",
              "Moderate",
              "Reduced — 7 to 10 km",
              "Sensitive groups take care",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Concentration levels">
        <InfoTable
          headers={["Level", "What you notice", "Who is affected"]}
          rows={[
            ["Light", "Slight haze on the horizon", "Nobody, generally"],
            [
              "Moderate",
              "Milky sky, hazy distance, muted sunset colours",
              "Asthma and respiratory conditions",
            ],
            [
              "Heavy",
              "Visibility clearly reduced, dust settling on surfaces",
              "Respiratory and cardiovascular conditions, children, older adults",
            ],
            [
              "Very heavy",
              "Marked haze, sun dimmed at midday",
              "Everyone; sensitive groups significantly",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Where the dust comes from">
        <Prose
          paragraphs={[
            "Between roughly May and September, strong winds lift mineral dust from the Sahara into the Saharan Air Layer — a dry, dusty mass of air that crosses the Atlantic in five to seven days and arrives over the Eastern Caribbean.",
            "The same air layer that carries the dust is dry and stable, which suppresses shower activity and can weaken developing tropical systems. A heavy dust episode often brings quieter weather with it.",
            "Health guidance during a dust episode is on the health and weather page.",
          ]}
        />
      </PageSection>
    </>
  );
}
