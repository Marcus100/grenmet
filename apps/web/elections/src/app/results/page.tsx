import type { Metadata } from "next";
import Link from "next/link";
import { Atlas } from "@/components/atlas/atlas";
import { PageHead } from "@/components/section";

export const metadata: Metadata = {
  title: "Results",
  description:
    "Every Grenada election and referendum since 1972 on the map, in 3D or flat, down to the polling division from 2013.",
};

export default function ResultsPage() {
  return (
    <>
      <PageHead
        deck={
          <>
            Every mapped election and referendum since 1972. Choose a year below
            the map, switch what the map shows, and select a constituency to see
            its result and, from 2013, every polling division. The same results
            are listed in full, with sources, under{" "}
            <Link className="underline underline-offset-4" href="/elections">
              Every election
            </Link>
            .
          </>
        }
        eyebrow="Results · 1972 to 2022"
        title="The results atlas"
      />
      <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-6">
        <Atlas />
      </div>
    </>
  );
}
