import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Night sky",
  description: "What to look for in the night sky from Grenada.",
};

export default function NightSkyPage() {
  return (
    <>
      <PageHeader
        description="What to look for after dark."
        title="Night sky"
      />
      <PageSection heading="A sky from both hemispheres">
        <Prose
          paragraphs={[
            "At about 12 degrees north, Grenada sees much of the southern sky as well as the northern. Polaris, the North Star, sits low above the northern horizon, while from roughly January to June the Southern Cross can be seen low in the south in the late evening or before dawn.",
            "The planets, the Moon and the Milky Way climb high overhead, and a clear night away from town lights shows far more stars than a city sky.",
          ]}
        />
      </PageSection>
      <PageSection heading="Good viewing">
        <Checklist
          items={[
            "Pick a night near new moon; a bright moon washes out faint stars.",
            "Get away from street lights: Levera, the hills or a dark beach.",
            "Give your eyes 20 minutes to adjust, and use a red light, not your phone screen.",
            "Check the forecast for cloud and Saharan dust haze, which dims the stars.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Sunrise, sunset and moon",
              href: "/weather/sun-and-sky",
              description: "Sun times, twilight and moon phase",
            },
            {
              name: "Saharan dust",
              href: "/weather/dust",
              description: "Haze outlook for the week",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
