import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Hurricane preparedness",
  description:
    "What every household in Grenada, Carriacou and Petite Martinique should have ready before the season.",
};

export default function HurricanePage() {
  return (
    <>
      <PageHeader
        description="What every household should have ready."
        title="Hurricane preparedness"
      />
      <PageSection heading="Before the season — by 1 June">
        <Checklist
          items={[
            "Agree where your household will shelter, and how you will reach each other if separated.",
            "Check the roof, straps and shutters while there is time to fix them.",
            "Clear drains, gutters and the gully near your property.",
            "Trim branches that could come down on the house or the power line.",
            "Photograph the property and keep documents in a sealed waterproof bag.",
            "Know which official shelter serves your area.",
          ]}
        />
      </PageSection>
      <PageSection heading="Supply kit">
        <Checklist
          items={[
            "Water — at least 4 litres per person per day for seven days.",
            "Non-perishable food for seven days, and a manual tin opener.",
            "Prescription medication for at least two weeks.",
            "Torches and spare batteries. Not candles — they start fires.",
            "A battery or wind-up radio, which works when the network does not.",
            "Power bank, first aid kit, cash in small notes, and copies of documents.",
            "Supplies for infants, older relatives and pets.",
          ]}
        />
      </PageSection>
      <PageSection heading="When a watch is issued">
        <Checklist
          items={[
            "Fill vehicle fuel tanks and water containers.",
            "Charge every device and power bank.",
            "Bring in or secure anything loose outdoors — furniture, sheeting, tools, boats.",
            "Fit shutters or board the windows.",
            "Confirm your plan with anyone who is elderly, isolated or has mobility needs.",
          ]}
          ordered
        />
      </PageSection>
      <PageSection heading="During the storm">
        <Prose
          paragraphs={[
            "Stay inside, away from windows, in the strongest interior room. Do not go outside during the calm of the eye — the wind returns from the opposite direction, often suddenly and at full strength.",
            "Wait for the all-clear from the National Disaster Management Agency. Calm weather is not the all-clear.",
          ]}
        />
      </PageSection>
      <PageSection heading="After">
        <Checklist
          items={[
            "Treat every downed line as live.",
            "Avoid floodwater — it hides debris, sewage and washed-out road surface.",
            "Check on neighbours who may not be able to check on themselves.",
            "Photograph damage before clearing it, for insurance purposes.",
            "Boil or treat water until the supply is confirmed safe.",
          ]}
        />
      </PageSection>
    </>
  );
}
