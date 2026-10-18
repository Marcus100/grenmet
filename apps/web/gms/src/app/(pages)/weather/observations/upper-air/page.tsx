import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Upper air",
  description:
    "Soundings through the depth of the atmosphere, and what they tell forecasters.",
};

export default function UpperAirPage() {
  return (
    <>
      <PageHeader
        description="Soundings through the depth of the atmosphere."
        title="Upper air"
      />
      <PlaceholderNotice product="The sounding data on this page" />
      <PageSection heading="Why soundings matter">
        <Prose
          paragraphs={[
            "Surface observations describe one level. A sounding describes the whole column — where the moisture sits, where the air is stable or unstable, and how the wind changes with height.",
            "That profile is what separates a day of harmless fair-weather cloud from a day of deep convection and thunderstorms, even when the surface conditions look identical.",
            "Soundings also anchor the models. A global model with no observation over the tropical Atlantic is guessing at the vertical structure it is supposed to be forecasting.",
          ]}
        />
      </PageSection>
      <PageSection heading="Regional soundings">
        <Prose
          paragraphs={[
            "Upper-air observations for the Eastern Caribbean come from a small number of stations across the region, and each one covers a large area of ocean. Their value to Grenada's forecast is out of proportion to their number.",
          ]}
        />
      </PageSection>
    </>
  );
}
