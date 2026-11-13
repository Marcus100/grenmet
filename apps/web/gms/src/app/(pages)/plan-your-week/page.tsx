import { SECTOR_CARD_WORDS, SectorWeek } from "@/components/home/data-sections";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata = {
  title: SECTOR_CARD_WORDS.title,
  description:
    "What this week's GMS alerts and warnings mean for tourism, marine, aviation, agriculture, health and roads.",
};

/** The full week behind the homepage "Plan your week" card (owner, 8 Nov 2026). */
export default function PlanYourWeekPage() {
  return (
    <>
      <PageHeader
        description="Every sector, the alerts and warnings that apply this week, when they apply and what to do."
        title={SECTOR_CARD_WORDS.title}
      />
      <SectorWeek />
    </>
  );
}
