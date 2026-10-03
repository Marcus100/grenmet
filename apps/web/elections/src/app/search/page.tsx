import type { Metadata } from "next";
import { SiteSearch } from "@/components/learn/site-search";
import { PageHead, Section } from "@/components/section";
export const metadata: Metadata = {
  title: "Search",
  description:
    "Find explanations, election records, candidates, parties and constituencies on Elections Grenada.",
};
export default function SearchPage() {
  return (
    <>
      <PageHead eyebrow="Find an answer" title="Explore Elections Grenada" />
      <Section id="search" title="What would you like to understand?">
        <SiteSearch />
      </Section>
    </>
  );
}
