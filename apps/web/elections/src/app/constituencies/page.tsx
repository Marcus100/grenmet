import type { Metadata } from "next";
import { ConstituencyGrid } from "@/components/constituencies/constituency-card";
import { HouseMap } from "@/components/constituencies/house-map";
import { ConstituencySearch } from "@/components/constituency-search";
import { ProvisionalSource } from "@/components/election/declared-result";
import { PageHead, Section } from "@/components/section";
import {
  declaredHouse,
  declaredResult,
  seatOutlook,
} from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";

export const metadata: Metadata = {
  title: "Constituencies",
  description:
    "Grenada’s 15 constituencies: who held each one at dissolution, how it voted in 2022, how it leans, and its 2026 candidates and result.",
};

export default function ConstituenciesPage() {
  const seats = seatOutlook(results, campaign);
  const declared = declaredResult(results, campaign);
  return (
    <>
      <PageHead
        deck={
          declared
            ? "Who won each of Grenada’s 15 constituencies on 5 November 2026 (provisional results), who held it at dissolution, how it voted in 2022 and how it leans."
            : "Who held each of Grenada’s 15 constituencies when Parliament was dissolved, how it voted in 2022, how it leans, and who is standing in 2026."
        }
        eyebrow="House of Representatives · 15 seats"
        learning="constituency"
        title="The 15 constituencies"
      >
        <ConstituencySearch className="mt-5 max-w-xl" size="large" />
      </PageHead>
      <Section
        id="map"
        title={
          declared
            ? "Who won each seat (provisional)"
            : "Who held each seat at dissolution"
        }
      >
        {declared ? (
          <>
            <HouseMap
              className="max-w-2xl"
              geo={geo}
              label="Party that won each seat in 2026 (provisional)"
              seats={declaredHouse(seats, declared)}
            />
            <ProvisionalSource className="text-el-muted mt-3 text-base leading-relaxed" />
          </>
        ) : (
          <HouseMap className="max-w-2xl" geo={geo} seats={seats} />
        )}
      </Section>
      <Section
        id="all"
        intro="Lean is the Grenada Lean Index: how much more NDC or NNP the constituency voted than the country, weighted 75% on 2022 and 25% on 2018."
        title="Every constituency"
      >
        <ConstituencyGrid declared={declared?.seatRows} seats={seats} />
      </Section>
    </>
  );
}
