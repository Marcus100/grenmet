import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
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
      <PageSection heading="Latest sounding">
        <InfoTable
          headers={["Level", "Height", "Temperature", "Wind"]}
          rows={[
            ["Surface", "0 m", "28.0 °C", "NE 14 kt"],
            ["925 hPa", "760 m", "22.4 °C", "ENE 18 kt"],
            ["850 hPa", "1500 m", "17.8 °C", "E 20 kt"],
            ["700 hPa", "3100 m", "8.2 °C", "E 15 kt"],
            ["500 hPa", "5850 m", "−6.4 °C", "ESE 12 kt"],
            ["300 hPa", "9600 m", "−36.2 °C", "SE 18 kt"],
            ["200 hPa", "12 400 m", "−58.0 °C", "S 22 kt"],
          ]}
        />
      </PageSection>
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
