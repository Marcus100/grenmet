import type { Metadata } from "next";
import { ConstituencyGrid } from "@/components/constituencies/constituency-card";
import { HouseMap } from "@/components/constituencies/house-map";
import { ConstituencySearch } from "@/components/constituency-search";
import { PageHead, Section } from "@/components/section";
import { seatOutlook } from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";

export const metadata: Metadata = {
  title: "Constituencies",
  description:
    "Grenada’s 15 constituencies: who held each one at dissolution, how it voted in 2022, how it leans and who is standing in 2026.",
};

export default function ConstituenciesPage() {
  const seats = seatOutlook(results, campaign);
  return (
    <>
      <PageHead
        deck="Who held each of Grenada’s 15 constituencies when Parliament was dissolved, how it voted in 2022, how it leans, and who is standing in 2026."
        eyebrow="House of Representatives · 15 seats"
        learning="constituency"
        title="The 15 constituencies"
      >
        <ConstituencySearch className="mt-5 max-w-xl" size="large" />
      </PageHead>
      <Section id="map" title="Who held each seat at dissolution">
        <HouseMap className="max-w-2xl" geo={geo} seats={seats} />
      </Section>
      <Section
        id="all"
        intro="Lean is the Grenada Lean Index: how much more NDC or NNP the constituency voted than the country, weighted 75% on 2022 and 25% on 2018."
        title="Every constituency"
      >
        <ConstituencyGrid seats={seats} />
      </Section>
    </>
  );
}
