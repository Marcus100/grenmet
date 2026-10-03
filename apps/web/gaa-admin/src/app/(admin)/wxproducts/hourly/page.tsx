import type { Metadata } from "next";
import Link from "next/link";
import { ERegister } from "@/components/wxproducts/eregister";
import { ImportedObservations } from "@/components/wxproducts/eregister-imported";

export const metadata: Metadata = {
  title: "wxRegister (Hourly)",
  description:
    "Meteorological observations register for Maurice Bishop International Airport — station 78958.",
};

export default async function HourlyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  const imported = filters.view === "imported";
  return (
    <div className="space-y-5">
      <nav
        aria-label="Observation collections"
        className="flex flex-wrap gap-4"
      >
        <Link
          aria-current={imported ? undefined : "page"}
          className="underline"
          href="/wxproducts/hourly"
        >
          Staff register
        </Link>
        <Link
          aria-current={imported ? "page" : undefined}
          className="underline"
          href="/wxproducts/hourly?view=imported"
        >
          Imported observations
        </Link>
      </nav>
      <p className="rounded-lg border bg-card p-4">
        SYNOP / wxRegister: staff observations are loaded from the dedicated
        eRegister database. Transmission and WIS2box publication require
        explicit approval.
      </p>
      {imported ? <ImportedObservations filters={filters} /> : <ERegister />}
    </div>
  );
}
