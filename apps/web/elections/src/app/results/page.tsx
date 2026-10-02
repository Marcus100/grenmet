import type { Metadata } from "next";
import { Atlas } from "@/components/atlas/atlas";
import { PageHead } from "@/components/section";

export const metadata: Metadata = {
  title: "Results",
  description:
    "Every Grenada election since 1951 and both referendums: historical constituency results, maps from 1972 and polling divisions from 2013.",
};

export default function ResultsPage() {
  return (
    <>
      <PageHead eyebrow="Results · 1951 to 2022" title="The results atlas" />
      <div className="mx-auto w-full px-4 pt-6 sm:px-6">
        <Atlas />
      </div>
    </>
  );
}
