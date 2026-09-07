import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "School stations",
  description:
    "Student-run weather stations adding density to Grenada's observing network.",
};

export default function SchoolStationsPage() {
  return (
    <>
      <PageHeader
        description="Student-run stations adding density to the network."
        title="School stations"
      />
      <PlaceholderNotice product="The school station listing on this page" />
      <PageSection heading="Participating schools">
        <InfoTable
          headers={["School", "Parish", "Measuring", "Since"]}
          rows={[
            [
              "Sample secondary school",
              "St. George",
              "Rain, temperature, wind",
              "Sample year",
            ],
            [
              "Sample secondary school",
              "St. Andrew",
              "Rain, temperature",
              "Sample year",
            ],
            [
              "Sample secondary school",
              "St. Patrick",
              "Rain, temperature",
              "Sample year",
            ],
            ["Sample school", "Carriacou", "Rain, temperature", "Sample year"],
          ]}
        />
      </PageSection>
      <PageSection heading="Two purposes at once">
        <Prose
          paragraphs={[
            "A school station teaches measurement, error and record-keeping in a way no textbook does — students maintain an instrument, notice when a reading looks wrong, and learn why siting matters.",
            "It also does real work. Grenada's terrain varies sharply over short distances, and every additional rain gauge sharpens the picture of where heavy rain actually fell. School stations fill gaps the official network cannot afford to cover.",
          ]}
        />
      </PageSection>
      <PageSection heading="Taking part">
        <Prose
          paragraphs={[
            "Schools interested in hosting a station can contact the Grenada Meteorological Service through general enquiries. Support covers siting, installation, basic maintenance and how to use the data in class.",
            "Data from school stations is clearly identified as such. It supplements the official record rather than forming part of it.",
          ]}
        />
      </PageSection>
    </>
  );
}
