import { Measure } from "@/components/measure";
import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Heat index",
  description:
    "How hot it feels in Grenada, and when heat becomes a health risk.",
};

/** A band of feels-like temperatures in °C, shown in the visitor's unit system. */
function band(low: number, high?: number, prefix?: string) {
  return (
    <Measure
      measure={{
        high: high ?? null,
        low,
        places: 0,
        prefix,
        quantity: "temperature",
      }}
    />
  );
}

export default function HeatIndexPage() {
  return (
    <>
      <PageHeader
        description="How hot it feels, and when to take care."
        title="Heat index"
      />
      <PlaceholderNotice product="The daily heat index" />
      <PageSection heading="What the heat index is">
        <Prose
          paragraphs={[
            "The heat index combines air temperature and humidity into a single “feels like” temperature. Your body cools by sweating; in humid air, sweat evaporates slowly, so you feel hotter than the thermometer reads.",
            <>
              In Grenada&apos;s humid climate, a{" "}
              <Measure
                measure={{ low: 31, places: 0, quantity: "temperature" }}
              />{" "}
              afternoon can feel like{" "}
              <Measure
                measure={{
                  high: 39,
                  low: 37,
                  places: 0,
                  quantity: "temperature",
                }}
              />
              . Direct sunshine can add several degrees more.
            </>,
          ]}
        />
      </PageSection>
      <PageSection heading="Heat index levels">
        <InfoTable
          headers={[
            "Feels like",
            "Level",
            "Risk with long exposure or activity",
          ]}
          rows={[
            [band(27, 32), "Caution", "Fatigue is possible"],
            [
              band(32, 41),
              "Extreme caution",
              "Heat cramps and heat exhaustion possible",
            ],
            [
              band(41, 54),
              "Danger",
              "Heat cramps and exhaustion likely; heat stroke possible",
            ],
            [
              band(54, undefined, "Above "),
              "Extreme danger",
              "Heat stroke highly likely",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Stay safe">
        <LinkList
          links={[
            {
              name: "Heat: prepare",
              href: "/alerts/prepare/heat",
              description: "Keeping cool on the hottest days",
            },
            {
              name: "UV index",
              href: "/weather/uv",
              description: "How strong the sun is today",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
