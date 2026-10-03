import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "How forecasts are made",
  description:
    "From observation to issued forecast at the GMS forecast office.",
};

export default function HowForecastsPage() {
  return (
    <>
      <PageHeader
        description="From observation to issued forecast."
        title="How forecasts are made"
      />
      <PageSection heading="The steps">
        <Checklist
          items={[
            "Observe: stations across the islands measure temperature, wind, pressure, humidity and rain, around the clock, and share them worldwide.",
            "Watch from above: weather satellites and regional radar show cloud, rain and storms across the Caribbean and the Atlantic.",
            "Model: supercomputers run numerical weather prediction models that calculate how the atmosphere is likely to change.",
            "Forecast: a meteorologist compares the models with what is actually happening, and uses local knowledge of how Grenada's mountains and coasts shape the weather.",
            "Issue: the forecast is written, checked and published on this site, the GMS app and to broadcasters, with alerts issued in CAP when hazards threaten.",
          ]}
          ordered
        />
      </PageSection>
      <PageSection heading="Why forecasts change">
        <Prose
          paragraphs={[
            "The atmosphere is chaotic: small differences grow over time, so forecasts are most reliable for the next day or two and less certain further ahead. As new observations arrive, forecasts are updated. That is why we issue morning, midday and evening forecasts.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Observations",
              href: "/weather/observations",
              description: "Latest readings from across the network",
            },
            {
              name: "Model guidance",
              href: "/weather/models",
              description: "The numerical guidance behind the forecast",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
