import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Flood preparedness",
  description: "Before, during and after heavy rain in Grenada.",
};

export default function FloodPage() {
  return (
    <>
      <PageHeader
        description="Before, during and after heavy rain."
        title="Flood preparedness"
      />
      <PageSection heading="How flooding happens in Grenada">
        <Prose
          paragraphs={[
            "Grenada's flooding is mostly flash flooding. Steep terrain and short, fast watercourses mean that heavy rain in the interior reaches the coast quickly — a gully can go from dry to dangerous in minutes, and the rain causing it may be falling several kilometres uphill, out of sight.",
            "Landslip is the other side of the same hazard. Saturated ground on a steep slope fails, and the risk keeps rising for a day or more after the rain stops.",
          ]}
        />
      </PageSection>
      <PageSection heading="Before">
        <Checklist
          items={[
            "Know whether your property sits on a flood path, a gully or below a steep slope.",
            "Keep drains and the nearest gully clear of debris.",
            "Store documents and valuables above likely flood level.",
            "Agree a route to higher ground that does not require crossing a watercourse.",
          ]}
        />
      </PageSection>
      <PageSection heading="During">
        <Checklist
          items={[
            "Never drive or walk through floodwater. Depth and current are impossible to judge, and the road beneath may be gone.",
            "Move to higher ground early rather than waiting to see how bad it gets.",
            "Disconnect electrical appliances if water is entering, but never touch them while standing in water.",
            "Keep away from gullies, culverts and river banks.",
          ]}
        />
      </PageSection>
      <PageSection heading="After">
        <Checklist
          items={[
            "Stay out of floodwater — it carries sewage, fuel and debris.",
            "Watch for landslip on saturated slopes for at least 24 hours after the rain stops.",
            "Boil or treat water until the supply is confirmed safe.",
            "Photograph damage before cleaning up.",
          ]}
        />
      </PageSection>
    </>
  );
}
